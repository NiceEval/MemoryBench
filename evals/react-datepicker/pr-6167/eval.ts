import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { sandboxLayer } from "niceeval/sandbox";
import { prepareRepo } from "../harness.ts";

// PR #6167, merge commit 6667a40d339d8fb5a6c02263b08d366cf2cfc449. gh's reported
// baseRefOid matches BASE_COMMIT exactly, and the merge commit's first parent is also
// BASE_COMMIT — no discrepancy to reconcile here.
const BASE_COMMIT = "be355b09d8ba18eeed82fa70968b1708687603ab";

export default defineEval({
  description:
    "react-datepicker pr-6167: stop rendering an extra wrapper div around the portaled calendar when withPortal is set (real react-datepicker issue)",
  // 纯 Node 仓库,corepack+yarn 装依赖、跑单个 jest 文件都在数十秒内完成,用默认超时足够。
  diff: {
    // package.json 加入排除:corepack+yarn install 会把 package.json 里内联的数组
    // (files/sideEffects/keywords/lint-staged)重新格式化成多行,是 install 步骤本身的
    // 副作用,不是 agent 的改动;修复只在 src/index.tsx,agent 不需要碰 package.json。
    ignore: ["coverage", "node_modules", "package.json", ".niceeval-clone"],
  },
  sandbox: sandboxLayer().prepare(prepareRepo(BASE_COMMIT)),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real react-datepicker repository at the commit where the " +
          "bug below reproduces. Find and fix the bug in the library source.\n\n" +
          "Bug: react-datepicker supports a `withPortal` prop that renders the calendar into a React portal " +
          "instead of inline/popper-positioned next to the input. When `withPortal` is set (and no `portalId` " +
          "override is used), the component currently wraps its output in an extra, unnecessary `<div>` around " +
          "the input container and the portal — an element with no styling purpose that does not exist in the " +
          "equivalent non-portal render path. Concretely, rendering `<DatePicker withPortal />` produces a DOM " +
          "shape where the element with class `react-datepicker__input-container` is nested one level deeper " +
          "than it should be, inside a superfluous wrapping `<div>`, instead of being a direct child of whatever " +
          "container the caller rendered `DatePicker` into. The fix should make the input container a direct " +
          "child of the render container in the `withPortal` case too, with no extra wrapping element in " +
          "between (the portaled calendar content itself still renders elsewhere via React's portal mechanism — " +
          "only the unnecessary wrapper around the input container should go away).\n\n" +
          "Environment notes: no root access is needed. Dependencies are already installed via " +
          "`corepack enable && yarn install --immutable`. Run tests with Jest, e.g. " +
          "`node_modules/.bin/jest src/test/datepicker_test.test.tsx` to scope to the datepicker component " +
          "tests. Fix the library source (likely in `src/index.tsx`, wherever the portal render branch builds " +
          "its returned JSX); do not just add workarounds in test files.",
      )
      .then((turn) => turn.succeeded().stopOnFailure());

    await t.sandbox.uploadFile(

      new URL("tests/datepicker_test.test.tsx", import.meta.url),

      "src/test/datepicker_test.test.tsx",

    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
