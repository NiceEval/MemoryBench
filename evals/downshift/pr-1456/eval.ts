import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { prepareRepo } from "../fixture.ts";

// real fix: downshift-js/downshift, commit d822530f6b3eebe34c3dc8249353b61dd237d78b
// ("feat(useSelect): improve highlight by character keys algorithm (#1456)"), which
// lands on top of BASE_COMMIT (its first parent — this was a squash merge, so the
// merge commit itself has exactly one parent, and that parent matches the PR's
// baseRefOid). Bug: useSelect's character-key type-ahead search treated the Space
// key inconsistently (it dispatched a dedicated "toggle button space" action instead
// of feeding into the character-search buffer like every other printable key,
// *unless* a search was already in progress), and the offset search in
// getItemIndexByCharacterKey always started scanning one position past the
// currently highlighted item — even when a query was already 2+ characters long and
// the currently highlighted item might still be a valid match for the next
// character typed — so repeating/continuing a rapid-succession character search
// could skip over an item that still matched or restart from the wrong index.
const BASE_COMMIT = "99bd9d936b46620d0e8f27dd3a35ca15149ec7b5";

export default defineEval({
  description:
    "downshift pr-1456: fix character-key type-ahead search to treat Space as a normal search character and to correctly advance through repeated-key matches (real downshift issue)",
  // 装依赖只有 npm install(该仓库 .npmrc 关了 lockfile),本地实测(Node 20.9.0,与沙箱一致)
  // CYPRESS_INSTALL_BINARY=0 跳过 cypress 二进制下载后 install ~1min;两条 babel
  // devDependency 补丁在同一条 install 命令里几秒内完成;scoped jest 跑单文件 < 2s。
  // 沿用全局默认 timeoutMs。
  diff: {
    ignore: ["coverage", "node_modules", ".niceeval-clone"],
  },
  plugins: prepareRepo(BASE_COMMIT),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real downshift repository (the accessible dropdown/combobox " +
          "primitive library) at the commit where the bug below reproduces. Find and fix the bug in the library " +
          "source.\n\n" +
          "Bug: the `useSelect` hook supports character-key type-ahead search on its toggle button — the user " +
          "types printable characters and the currently highlighted item jumps to the next item whose label " +
          "starts with the characters typed so far (characters typed in quick succession accumulate into a single " +
          "search query; if the user pauses, the next character starts a brand-new query). This has two bugs:\n\n" +
          "1. The Space character (`' '`) is not treated the same as other printable characters. Every other " +
          "printable key gets appended to the in-progress search query, but Space is special-cased to instead " +
          "toggle/select behavior (as if no search were active), even while the user is in the middle of typing a " +
          "multi-character query that happens to contain a space. So typing a query like `1 2 3` — where the " +
          "matching item's label literally contains spaces — does not work: as soon as the space character is " +
          "typed, the search buffer is not extended the way it is for a letter or digit, and the wrong item ends " +
          "up highlighted.\n\n" +
          "2. When continuing to add characters to an already-in-progress search query (i.e. the query so far is " +
          "already 2 or more characters long), the search for the next matching item always starts scanning from " +
          "one position *after* the currently highlighted item, unconditionally. That's correct for the very " +
          "first character of a new query (you don't want to just re-match the item you're already on), but once " +
          "a multi-character query is already in progress, the currently highlighted item itself is still a valid " +
          "candidate — it may still match the longer query being typed, or it may be exactly the item that should " +
          "be reached next. Always skipping past it means the search can land one item too far forward, or skip " +
          "over an item that should have matched, so repeated/rapid-succession character searches don't reliably " +
          "advance through all matching items in the order the user would expect.\n\n" +
          "Environment notes: dependencies are already installed (Node, npm). You can scope the existing Jest " +
          "suite to whatever file you're iterating on with `npx kcd-scripts test --no-watch <path-to-file>`. Fix " +
          "the library source; do not just add workarounds in test files.",
      )
      .then((turn) => turn.succeeded().stopOnFailure());

    await t.sandbox.uploadFile(

      new URL("tests/getToggleButtonProps.test.js", import.meta.url),

      "src/hooks/useSelect/__tests__/getToggleButtonProps.test.js",

    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
