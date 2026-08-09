import { defineEval } from "niceeval";
import { commandSucceeded } from "niceeval/expect";
import { sandboxLayer } from "niceeval/sandbox";
import { prepareRepo } from "../harness.ts";

// 挖自真实合入 PR Hacker0x01/react-datepicker#6073(不让被测 agent 看到 PR 号/commit)。merge
// commit 649af62fee622afbda7db7ec3f935efbf6fd9676 提供隐藏测试的权威 post-fix 内容。Bug:范围选择、
// 多月展示时,选了起始日后 hover 预览范围,`src/day.tsx` 会把「属于相邻月份、但作为填充格渲染在当前
// 月网格里的日子(前导/后随日)」也加上 in-selecting-range 高亮。真实修复让某个日格只有在确实属于它
// 所在网格代表的那个月份时才参与范围预览高亮(复用 Day 上已有的 isBeforeMonth/isAfterMonth,不引入
// 新导出)。隐藏测试是 day_test.test.tsx 里新增的行为用例,断言只查渲染 DOM 的 class(class 名是测试
// 文件内的字符串字面量,不 import 任何新符号),base_sha 下必失败(3 failed / 103 passed),打上真实
// 修复后 106 全绿——本地 Node 20.9.0 双向验证过。
const BASE_COMMIT = "4f3d75298c20884f5c5634ff04971260233af7c5";

export default defineEval({
  description:
    "react-datepicker pr-6073: in range mode across multiple months, the in-selecting-range hover highlight is " +
    "wrongly applied to filler day cells that belong to an adjacent month; a cell must only join the " +
    "selecting-range highlight when it actually belongs to the month its grid represents (real react-datepicker issue)",
  // yarn (Berry) 装依赖会把 package.json 内联数组重排(install 副作用,非 agent 改动),排掉避免假噪音。
  diff: {
    ignore: ["coverage", "node_modules", "package.json", ".niceeval-clone"],
  },
  sandbox: sandboxLayer().prepare(prepareRepo(BASE_COMMIT)),
  async test(t) {
    await t
      .send(
        "Your working directory is a checkout of the real react-datepicker repository (a React date-picker " +
          "component library) at the commit where the bug below reproduces. Find and fix the bug in the library " +
          "source.\n\n" +
          "Bug: in a range-selection date picker (e.g. `selectsRange`) that displays more than one month at a " +
          "time, after a start date has been chosen the user hovers over a date to preview the range that would " +
          "be selected. Each month's calendar grid also renders a few 'filler' day cells that actually belong " +
          "to the adjacent month (the leading days from the previous month and the trailing days from the next " +
          "month, shown to fill out the first/last week rows). The bug is that these out-of-month filler cells " +
          "incorrectly receive the in-selecting-range preview highlight. A day cell that falls outside the " +
          "month its grid represents should never participate in the selecting-range highlight — only cells " +
          "that genuinely belong to the displayed month should. Fix the day-rendering logic so the " +
          "in-selecting-range highlight is applied only to cells belonging to the month being displayed. Fix " +
          "the library source (under `src/`); do not just add workarounds in test files.\n\n" +
          "Environment notes: this is a Node/TypeScript project managed with Yarn (Berry) via Corepack; " +
          "dependencies are already installed (re-run `corepack enable && yarn install --immutable` if you " +
          "ever need to). Tests use Jest — run a single file with `node_modules/.bin/jest <path>`.",
      )
      .then((turn) => turn.succeeded().stopOnFailure());

    // 真实仓库路径:覆盖掉 agent 可能留下的任何版本,判分对齐上游隐藏测试。
    await t.sandbox.uploadFile(
      new URL("tests/day_test.test.tsx", import.meta.url),
      "src/test/day_test.test.tsx",
    );
    await t.sandbox.uploadFile(
      new URL("tests/run-tests.sh", import.meta.url),
      "tests/run-tests.sh",
    );

    t.check(await t.sandbox.runCommand("bash", ["tests/run-tests.sh"]), commandSucceeded());
  },
});
