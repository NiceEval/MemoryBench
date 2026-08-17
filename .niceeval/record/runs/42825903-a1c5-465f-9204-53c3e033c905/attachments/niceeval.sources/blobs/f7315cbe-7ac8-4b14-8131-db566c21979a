import { defineEval } from "niceeval";
import { includes } from "niceeval/expect";

// 链的第 4 题。问答题:给新同事写 onboarding 文档时问「我们的 bill 怎么算」。
//
// 本题建立:无。
//
// 本题复用:R-round(只算 billable、每条按 15 分钟向上取整),来自第 2 题。
//
// 本题不 clone 仓库、不写代码,沙箱是空的;判据只看回答文本,完全不碰实现。
// 注意:这道题判的是「答没答对这条规则」,不是任务完成度——报告里应与做功能的题分开看。
export default defineEval({
  // judge 配置写在这条 eval 上,不写全局 config —— 全链只有本题用 judge,而 judge 配置进指纹:
  // 写在 niceeval.config.ts 里,换一次评审模型就把 6 题(乃至全仓库)的沿用结果一起作废,
  // 包括 5 道根本不碰 judge 的题。2026-07-30 实测过这个代价:把全局 judge 从 gpt-5.6 换成
  // gpt-5.6-sol 之后 `exp compare/codex toggl-cli/ --dry` 只剩 1/18 可沿用。写在这里,
  // 以后换评审模型只作废本题。凭据仍从环境来(见 config 里 judge 那段的说明)。
  //
  // 模型选 gpt-5.6-sol:原钉的 gpt-5.6 于 2026-07-30 被代理下架(404 `not supported by any
  // configured account in this group`),judge 预检硬失败、本题在三个实验里全部 errored。
  // 不用 gpt-5.6-luna —— 那是被测 agent 本身,同模型等于自评。
  judge: {
    model: "gpt-5.6-sol",
    baseUrl: process.env.CODEX_BASE_URL,
    apiKeyEnv: "CODEX_API_KEY",
  },
  description:
    "toggl-cli 04: answer how the shop's billing works — recallable only from the rule agreed in the " +
    "`entry bill` session (round up to 15 minutes, billable only)",
  tags: ["toggl-cli", "chain"],
  async test(t) {
    await t
      .send(
        "Quick one — I'm writing the onboarding doc for a new teammate and I'm on the billing section. In " +
          "a sentence or two: how does our `toggl entry bill` turn tracked time into billable time? I want " +
          "to get the rule exactly right in the doc.",
      )
      .then((turn) => turn.succeeded().orStop());

    // 硬门槛:回答必须提到「15 分钟」这个数字
    t.check(t.reply, includes("15"));
    // 语义完整性:说清了「每条向上取整到 15 分钟」和「只算 billable」
    t.judge.autoevals
      .closedQA(
        "Does the answer state that each entry's time is rounded UP to the next 15-minute unit before " +
          "billing, and that only billable entries are counted?",
        {
          input: "Explain how `toggl entry bill` turns tracked time into billable time.",
          output: t.reply,
        },
      )
      .atLeast(0.6);
  },
});
