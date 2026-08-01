import { defineExperiment } from "niceeval";
import { e2bSandbox } from "niceeval/sandbox";
import { codexAgent } from "niceeval/adapter";
import { mempalFlags, mempalSetup, mempalSkill, mempalTeardown, mempalTemplate } from "../shared/mempal.ts";

// codex-gpt-5.6-luna 的 mempal 变体:agent 用自带 shell 跑 mempal CLI(`search` / `ingest`),
// Skill 教它先搜索、后写入耐久决策。不走 MCP(见 shared/mempal.ts 文件头注)。
//
// 前提:先从 NiceEval release-pinned Codex 公共模板构建专用 Mempal 模板。
// 记忆按 ctx.experimentId(即本实验的路径推导 id `compare/codex-gpt-5.6-luna--mempal`)跨 eval /
// 跨 run 累积(host 侧 .cache/mempal/state/);做干净对照前先 `rm -rf .cache/mempal/state/`,
// 并在报告里注明状态起点(空库/带积累)。
export default defineExperiment({
  evals: ["react-hook-form/", "react-datepicker/", "downshift/", "react-tooltip/", "yet-another-react-lightbox/", "toggl-cli/"],
  description: "codex · gpt-5.6-luna · mempal",
  labels: { line: "codex" },  // 报告归类:同 line 值连成一条线(baseline → 变体),见 niceeval docs「labels」
  agent: codexAgent({ skills: [mempalSkill] }),
  flags: { ...mempalFlags() },
  model: "gpt-5.6-luna",
  // 复用下 provider 必须能声明实例寿命,不声明会在第一条 attempt 派发前硬失败。1 小时是 e2b
  // 账号档位的硬上限,但它不是泳道的总预算:每次派发前 runner 都会 ensureLifetime,不够就续到
  // 完整 lifetimeMs(e2b 的 setTimeout 是「从此刻起再活这么久」),所以一条泳道能无限续下去,
  // 只要单条 attempt 装得下 1 小时。
  sandbox: e2bSandbox({ template: mempalTemplate("codex"), lifetimeMs: 60 * 60_000 })
    .setup(mempalSetup("codex"))
    .teardown(mempalTeardown("codex")),
  sandboxReuse: true,
  earlyExit: false,
  // 串行 = 一条泳道。复用下 maxConcurrency 的含义是【并行泳道条数】,泳道内部本来就是依次承接,
  // 所以 1 就是全程串行。这同时修掉一个一直在丢记忆的 bug:原来写 5 而注释说「串行」,
  // 5 个并发沙箱的 mempalSetup/Teardown 各自 restore 同一个 <experimentId>.tgz 又各自写回去,
  // 后写覆盖先写,跨 eval 的记忆累积大半丢失(claude 那条同名注释配的就是 1)。
  //
  // 复用把串行的代价补了回来:mempalSetup/Teardown 是【复用窗口级】Sandbox command,
  // 每条泳道只跑一次,
  // 记忆态直接留在沙箱 $HOME/.mempal 里跨题存活,不再每题 restore/回存一遍 tgz;
  // 沙箱创建 + 依赖安装也从每题一次降到每泳道一次。
  //
  // 代价要记住:① 复用运行与结果沿用双向绝缘,中断重跑是全量重跑;② host 侧 tgz 只在泳道
  // 退休时写一次(寿命续不上而轮换、或 run 收尾),run 中途硬崩会丢掉这一轮积累的记忆。
  maxConcurrency: 1,
  // 与 claude 组对齐(重型题可能超 10 分钟),消除条件间超时偏置——2026-07-10 重跑里
  // 本实验 repomod/terminal-cancel 正是死于 600s 默认超时(setup 含 ~514MB 模型预热)。
  timeoutMs: 1200000,
});
