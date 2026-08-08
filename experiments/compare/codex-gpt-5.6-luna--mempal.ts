import { defineExperiment } from "niceeval";
import { e2bSandbox } from "niceeval/sandbox";
import { codexAgent } from "niceeval/adapter";
import { mempalFlags, mempalLoadState, mempalPrepare, mempalSaveState, mempalSkill, mempalTemplate } from "../shared/mempal.ts";

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
  // 账号档位的硬上限,但它不是整次 run 的总预算:每次派发前 runner 都会 ensureLifetime,不够就续到
  // 完整 lifetimeMs(e2b 的 setTimeout 是「从此刻起再活这么久」),所以同一物理 Sandbox 可以持续复用,
  // 只要单条 Attempt 装得下 1 小时。
  sandbox: e2bSandbox({ template: mempalTemplate("codex"), lifetimeMs: 60 * 60_000 })
    .prepare(mempalPrepare("codex"))
    .setup(mempalLoadState)
    .teardown(mempalSaveState),
  earlyExit: false,
  // Group 内串行复用，Group 间并行；host checkpoint 按 (Experiment, Group) 隔离。
  maxConcurrency: 4,
  // 与 claude 组对齐(重型题可能超 10 分钟),消除条件间超时偏置——2026-07-10 重跑里
  // 本实验 repomod/terminal-cancel 正是死于 600s 默认超时(setup 含 ~514MB 模型预热)。
  // toggl-cli chain evals explicitly need a 30-minute agent deadline; keep the
  // experiment ceiling aligned so it does not truncate their per-eval timeout.
  timeoutMs: 1_800_000,
});
