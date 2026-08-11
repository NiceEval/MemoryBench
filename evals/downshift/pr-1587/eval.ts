import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { sandboxLayer } from "niceeval/sandbox";
import { prepareRepo } from "../fixture.ts";

// real fix: downshift PR #1587 (merge 87a8137e6c69d4d0086bd2a2b333367762ce477a),
// which lands on top of BASE_COMMIT (its first parent). Bug: getHighlightedIndexOnOpen()
// in src/hooks/utils.js picks initialHighlightedIndex / defaultHighlightedIndex without
// ever checking isItemDisabled(), so opening useCombobox/useSelect can initially highlight
// a disabled item.
const BASE_COMMIT = "57981b297cfab75e0b11c8685195ad17cbf928d5";

export default defineEval({
  description:
    "downshift pr-1587: skip disabled items when computing the initial highlighted index on menu open (real downshift issue)",
  // 装依赖是 npm install(需 --legacy-peer-deps,root devDependency react-native 与 react
  // 版本冲突,和 Node 版本无关;CYPRESS_INSTALL_BINARY=0 跳过 cypress postinstall 冷下载,
  // 与 scoped jest 跑测试无关),本地实测 install ~2 分钟,scoped jest 跑两个文件 < 3s;
  // 沿用全局默认 timeoutMs。
  diff: {
    ignore: ["coverage", "node_modules", ".niceeval-clone"],
  },
  sandbox: sandboxLayer().prepare(prepareRepo(BASE_COMMIT)),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real downshift repository at the commit where the bug below " +
          "reproduces. Find and fix the bug in the library source.\n\n" +
          "Bug: downshift's `useCombobox` and `useSelect` hooks both accept an `isItemDisabled(item, index)` prop " +
          "that marks certain items as disabled — disabled items are supposed to be skipped during keyboard " +
          "navigation and are never selectable. Separately, both hooks accept `initialHighlightedIndex` and " +
          "`defaultHighlightedIndex` props that control which item is highlighted the first time the menu opens " +
          "(`initialHighlightedIndex` seeds the very first open only; `defaultHighlightedIndex` is the fallback " +
          "used whenever there's no other value to highlight, e.g. on every open where nothing else was " +
          "selected). The logic that computes this initial highlight on open currently reads " +
          "`initialHighlightedIndex` / `defaultHighlightedIndex` and returns whichever one applies without ever " +
          "consulting `isItemDisabled` — so if the configured index happens to point at an item the caller has " +
          "marked disabled, the menu still opens with that disabled item highlighted, exactly as if it weren't " +
          "disabled at all. Expected behavior: opening the menu should never initially highlight a disabled item. " +
          "If `initialHighlightedIndex` points at a disabled item, it should be skipped (falling through to " +
          "`defaultHighlightedIndex` if that one points at a non-disabled item, otherwise falling through to " +
          "whatever the next rule in the existing fallback chain is). Likewise, if `defaultHighlightedIndex` " +
          "points at a disabled item, it should not be used as the initial highlight either.\n\n" +
          "Environment notes: dependencies are already installed (Node, npm). You can scope the existing Jest " +
          "suite to whatever file you're iterating on with `node_modules/.bin/jest <path-to-file>` (or " +
          "`npx kcd-scripts test --no-watch <path-to-file>`). Fix the library source; do not just add " +
          "workarounds in test files.",
      )
      .then((turn) => turn.succeeded().stopOnFailure());

    await t.sandbox.uploadFile(

      new URL("tests/useCombobox/props.test.js", import.meta.url),

      "src/hooks/useCombobox/__tests__/props.test.js",

    );
    await t.sandbox.uploadFile(
      new URL("tests/useSelect/props.test.js", import.meta.url),
      "src/hooks/useSelect/__tests__/props.test.js",
    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
