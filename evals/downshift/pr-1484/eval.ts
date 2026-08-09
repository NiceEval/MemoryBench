import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { sandboxLayer } from "niceeval/sandbox";
import { prepareRepo } from "../harness.ts";

// real fix: downshift PR #1484 (squash-merge 4ff13853df24803e9d07b0c90438e28b7c00a778,
// a single-parent commit whose parent equals BASE_COMMIT below, which also matches gh's
// reported baseRefOid exactly). Bug: the blur handler inside useCombobox's
// getInputProps() always dispatched InputBlur with `selectItem: true`, regardless of why
// the input lost focus. It never looked at the blur event's `relatedTarget`, so a blur
// caused by switching browser tabs (relatedTarget === null, since focus leaves the
// document entirely) was treated exactly like a deliberate click/tab-away confirmation,
// auto-selecting whatever item happened to be highlighted.
const BASE_COMMIT = "9b3199aa354f143617b148cf82f215f1e4986690";

export default defineEval({
  description:
    "downshift pr-1484: don't auto-select the highlighted combobox item when the input blurs because the browser " +
    "tab changed (real downshift issue)",
  // 装依赖只有 npm install(无锁文件,.npmrc 设 package-lock=false),本地实测 install ~1-2 分钟;
  // 这个 base commit 下 npm install 会把 @babel/plugin-proposal-private-property-in-object 和
  // @babel/plugin-proposal-private-methods 解析成 kcd-scripts/babel-preset-react-app 认不出的
  // "placeholder" 版本(babel 7.21 系的已知坑),导致 jest 在 transform 阶段直接报错、不到测试
  // 断言就整体失败——用显式版本号 --no-save 补装这两个包覆盖 placeholder 即可,本地在此 base
  // commit 上验证过 fail-to-pass 两个方向都干净通过。scoped jest 跑单文件 < 2s;沿用全局默认
  // timeoutMs。
  diff: {
    ignore: ["coverage", "node_modules", ".niceeval-clone"],
  },
  sandbox: sandboxLayer().prepare(prepareRepo(BASE_COMMIT)),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real downshift repository at the commit where the bug below " +
          "reproduces. Find and fix the bug in the library source.\n\n" +
          "Bug: `useCombobox`'s input keeps track of a currently highlighted item while its menu is open. When " +
          "the input loses focus (blurs) while the menu is open, downshift is supposed to distinguish between two " +
          "very different situations. If the user deliberately moved focus away — clicking somewhere else on the " +
          "page, or tabbing to the next focusable element — that counts as confirming their choice, so the " +
          "currently highlighted item should be auto-selected as the input blurs. But if focus left the input " +
          "only because the user switched to a different browser tab or window (so focus leaves the document " +
          "entirely, with no other element on the page actually receiving it), that is not a deliberate choice " +
          "and should NOT auto-select anything — the menu should just close, leaving the selection untouched. " +
          "Currently, the blur handler doesn't make this distinction at all: it always behaves as though the user " +
          "clicked/tabbed away, so switching tabs while an item is highlighted incorrectly selects that item, " +
          "even though the user never interacted with the page to confirm it.\n\n" +
          "Concretely: open the combobox's menu, highlight an item (without clicking it), then blur the input in " +
          "a way that mirrors a tab-switch — i.e. the blur event's `relatedTarget` is `null`, since no other " +
          "element on the page gains focus. The menu should close and the highlighted item should NOT become the " +
          "selected item. Blurring in a way that does have a `relatedTarget` (focus genuinely moving to another " +
          "element) should keep behaving exactly as it already does today — that path is correct and shouldn't " +
          "change.\n\n" +
          "Environment notes: dependencies are already installed (Node, npm). You can scope the existing Jest " +
          "suite to whatever file you're iterating on with `npx kcd-scripts test --no-watch <path-to-file>`. Fix " +
          "the library source (in the `useCombobox` hook); do not just add workarounds in test files.",
      )
      .then((turn) => turn.succeeded().stopOnFailure());

    await t.sandbox.uploadFile(

      new URL("tests/getInputProps.test.js", import.meta.url),

      "src/hooks/useCombobox/__tests__/getInputProps.test.js",

    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
