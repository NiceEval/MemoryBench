import { defineExperiment } from "niceeval";
import { dockerSandbox } from "niceeval/sandbox";
import { bubAgent } from "niceeval/adapter";
import { BUB_DOCKER_IMAGE } from "../shared/bub.ts";

// 文件夹 compare = 唯一一组【可对比】的实验:同一批记忆 eval、同一个模型(gpt-5.6-terra)。
// 文件名 = <agent>-<model>。`niceeval exp compare` 跑整组。
//
// **这一条是 bub 的 no-memory baseline,不是 tape 记忆条件**(2026-08-04 更正,此前文件头写的
// 「bub 默认 tape 开 = 带 tape 记忆」是错的)。根据 niceeval docs「内置 agent 能力表」,bub 的
// tape(`~/.bub/tapes/<hash>.jsonl`)有两个身份:① adapter 读它当 transcript;② `--session-id`
// 的**会话续接**——而那一栏指的是同一条 Attempt 内跨轮(配 `t.newSession()` 用),不是跨 eval。
// Eval Group 会复用 Sandbox，但 bub 只把 tape 用于同一 Attempt 的会话续接；本实验不提供
// 跨 Eval 的 tape 检索能力，因此仍是 no-memory baseline。
// 这和 remem 那条已确诊的 caveat 同构(见 shared/remem.ts):接线没错,但记忆没积累。
//
// 所以它的用途是**同模型下 bub vs codex 的 agent 对照**(对 codex-gpt-5.6-terra.ts),以及将来
// bub--tape 变体的 baseline。真要采 tape 记忆条件,得照 obelisk/remem 的做法另开一个变体文件:
// tape 归档/还原钩子，且**前提是先零成本验证
// bub 到底有没有跨 session 检索历史 tape 的能力**——文档没有任何一处说它会。
export default defineExperiment({
  description: "bub · gpt-5.6-terra",
  labels: { line: "bub" },  // 报告归类:同 line 值连成一条线(baseline → 变体),见 niceeval docs「labels」
  // BUB_* 当前代理池没有 gpt-5.6-terra；同一套 CODEX_* 代理已用 Chat Completions
  // 实测支持该模型。显式共用它，保证两条 baseline 的模型与上游服务一致。
  agent: bubAgent({
    apiBase: process.env.CODEX_BASE_URL,
    apiKey: process.env.CODEX_API_KEY,
  }),
  flags: { memory: "baseline" },
  model: "gpt-5.6-terra", // 两边钉同一个模型,差异才归因到 agent / 记忆机制
  evals: ["react-hook-form/", "react-datepicker/", "downshift/", "react-tooltip/", "yet-another-react-lightbox/", "toggl-cli/"],
  // 官方 Bub r2 虽声明 USER node，但 /usr/local 仍归 root，lightbox 的 Group setup 无法用
  // `n` 切 Node 版本。派生镜像只补齐非 root Node 工具安装面；上游修复后改回官方常量。
  sandbox: dockerSandbox({ source: { type: "image", image: BUB_DOCKER_IMAGE }, lifetimeMs: 60 * 60_000 }),
  // 注:workspace(starter repo)上传 + 装依赖不在这儿 —— 那属于「eval 在什么上面干活」,
  // 写在各 eval 的 test(t) 里(t.sandbox.uploadDirectory + runCommand)。experiment 只管怎么跑。
  earlyExit: false, // 要完整通过率分布,以便报 pass^k
  // 六个 Eval Group 各占一条可复用 lane；Group 内串行，Group 间全部并行。
  // 全局 30 只是多实验共同运行时的安全阀，不替代本实验的复用边界。
  maxConcurrency: 6,
  // 与 codex 各条对齐(重型题 mvn build / pytest 可能超 10 分钟),消除条件间超时偏置。
  // toggl-cli 五条链式题自己声明 timeoutMs: 1_800_000,实验级上限比它紧会把单题超时截短,
  // 所以这里必须 ≥ 它 —— 原来的 1_200_000 就是在截断它们。
  timeoutMs: 1_800_000,
});
