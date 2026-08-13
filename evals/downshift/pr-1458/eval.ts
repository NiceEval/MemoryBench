import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { prepareRepo } from "../fixture.ts";

// real fix: downshift-js/downshift, commit d1a7f67977e207a1f489af964c707a73e0763dc1
// ("fix(useMultipleSelection): prevent adding items on Backspace/Delete without
// activeIndex (#1458)"), which lands on top of BASE_COMMIT (its first parent — this
// was a squash merge, so the merge commit itself has exactly one parent). Bug: the
// useMultipleSelection reducer handled SelectedItemKeyDownBackspace/Delete without
// checking whether an item was actually focused (activeIndex >= 0), so Backspace/
// Delete on a non-focused selected item could still remove/duplicate items.
const BASE_COMMIT = "d822530f6b3eebe34c3dc8249353b61dd237d78b";

export default defineEval({
  description:
    "downshift pr-1458: only react to Backspace/Delete on a selected item when that item is actually focused (real downshift issue)",
  // 装依赖只有 npm install(该仓库 .npmrc 关了 lockfile),本地实测 CYPRESS_INSTALL_BINARY=0
  // 跳过 cypress 二进制下载后 install ~25s;两条 babel devDependency 补丁各几秒;scoped jest
  // 跑两个文件 < 2s。沿用全局默认 timeoutMs。
  diff: {
    ignore: ["coverage", "node_modules", ".niceeval-clone"],
  },
  sandbox: prepareRepo(BASE_COMMIT),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real downshift repository (the accessible dropdown/combobox " +
          "primitive library) at the commit where the bug below reproduces. Find and fix the bug in the library " +
          "source.\n\n" +
          "Bug: downshift ships a `useMultipleSelection` hook for building multi-select widgets (e.g. a tag input " +
          "where each selected item renders as its own focusable chip). Each selected-item chip gets keydown " +
          "handling so that, when that specific chip is focused, pressing Backspace or Delete removes it. " +
          "Internally the hook tracks which selected item (if any) is currently the focused/active one via an " +
          "`activeIndex` piece of state; `activeIndex` is `-1` whenever no selected item currently has focus. The " +
          "reducer's handling of the Backspace/Delete keydown action does not check `activeIndex` at all before " +
          "acting — it just goes ahead and removes an item (or, in edge cases, ends up duplicating item removal " +
          "logic) using whatever `activeIndex` happens to hold, including `-1` or a stale index left over from a " +
          "previous interaction. As a result, dispatching a Backspace/Delete keydown on a selected-item chip that " +
          "does NOT currently have focus can still incorrectly mutate the selected-items list — items can be " +
          "removed (or the internal bookkeeping otherwise corrupted) even though the user never focused that chip " +
          "before pressing the key. The correct behavior is that Backspace/Delete keydown on a selected item " +
          "should only remove anything when an item is actually focused/active (i.e. only when `activeIndex` " +
          "points at a real, currently-focused selected item) — if nothing is focused, the keydown should be a " +
          "no-op and the selected items should be left completely unchanged.\n\n" +
          "Environment notes: dependencies are already installed (Node, npm). You can scope the existing Jest " +
          "suite to whatever file you're iterating on with `npx kcd-scripts test --no-watch <path-to-file>`. Fix " +
          "the library source; do not just add workarounds in test files.",
      )
      .then((turn) => turn.succeeded().orStop());

    await t.sandbox.uploadFile(

      new URL("tests/getSelectedItemProps.test.js", import.meta.url),

      "src/hooks/useMultipleSelection/__tests__/getSelectedItemProps.test.js",

    );
    await t.sandbox.uploadFile(
      new URL("tests/props.test.js", import.meta.url),
      "src/hooks/useMultipleSelection/__tests__/props.test.js",
    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
