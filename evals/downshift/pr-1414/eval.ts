import { defineEval } from "niceeval";
import { sandboxLayer } from "niceeval/sandbox";
import { commandSucceeded } from "niceeval/expect";
import { prepareRepo } from "../harness.ts";

// real fix: downshift PR #1414 (squash-merge 6bd18eb8e4a2f3003bd49a14eb0791b2370ba36c, a
// single-parent commit whose parent equals BASE_COMMIT below). Bug: in useCombobox, clicking
// an item in the open menu momentarily blurs the text input — the old code dispatched the
// selection and then imperatively re-focused the input, but the native mousedown on the item
// still blurred the input first, producing a focus flicker. The real fix removes the
// imperative refocus and instead has getItemProps() return an `onMouseDown` handler that
// calls preventDefault() (composed via callAllEventHandlers so a user-supplied onMouseDown
// and preventDownshiftDefault still work), suppressing the blur. Hidden test = the merged
// getItemProps.test.js; base_sha 下必失败(2 failed / 19 passed),打上真实修复后 21 全绿——
// 本地 Node 20.9.0 双向验证过。
const BASE_COMMIT = "78ce9e994e2d7056ce70bab83083bc1c9f805e3e";

export default defineEval({
  description:
    "downshift pr-1414: clicking an item in an open useCombobox menu must keep the text input focused (no focus " +
    "flicker); getItemProps() should expose a mousedown handler that suppresses the default blur while still " +
    "composing with a user-supplied onMouseDown and preventDownshiftDefault (real downshift issue)",
  // 装依赖:CYPRESS_INSTALL_BINARY=0 跳过 cypress 二进制下载;这个 2022 年代 base commit 下裸
  // npm install 会把 @babel/plugin-proposal-private-property-in-object /
  // @babel/plugin-proposal-private-methods 解析成 kcd-scripts 认不出的 "placeholder" 版本
  // (babel 7.21 系已知坑),jest 在 transform 阶段就炸——显式补装两个精确版本修掉。补装用
  // --no-save 不碰 package.json,且发生在 t.send() 之前(落在 eval window,不污染 agent 判分 diff)。
  diff: {
    ignore: ["coverage", "node_modules", ".niceeval-clone"],
  },
  sandbox: sandboxLayer().prepare(prepareRepo(BASE_COMMIT)),

  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real downshift repository at the commit where the bug " +
          "below reproduces. Find and fix the bug in the library source.\n\n" +
          "Bug: in the `useCombobox` hook, when the menu is open and the user clicks one of the items to select " +
          "it, the text input momentarily loses focus (a focus flicker). The item is still selected, but focus " +
          "should never leave the input during a click-to-select — after clicking an item the input must remain " +
          "focused (and show the selected item's value). The underlying cause is that a native mousedown on the " +
          "item blurs the input before the selection is handled. The correct behavior is that `getItemProps()` " +
          "returns an `onMouseDown` handler for each item that suppresses this default blur (so focus stays on " +
          "the input), and this handler must compose correctly with a consumer-supplied `onMouseDown`: the " +
          "consumer's handler still runs, and if the consumer marks the event with `preventDownshiftDefault` " +
          "then downshift's own blur-suppression is skipped. Fix the library source so clicking an item keeps " +
          "the input focused. Fix the library source (under `src/`); do not just add workarounds in test " +
          "files.\n\n" +
          "Environment notes: dependencies are already installed (Node, npm). You can scope the existing Jest " +
          "suite to whatever file you're iterating on with `npx kcd-scripts test --no-watch <path-to-file>`. " +
          "Fix the library source; do not just add workarounds in test files.",
      )
      .then((turn) => turn.succeeded().stopOnFailure());

    await t.sandbox.uploadFile(

      new URL("tests/getItemProps.test.js", import.meta.url),

      "src/hooks/useCombobox/__tests__/getItemProps.test.js",

    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
