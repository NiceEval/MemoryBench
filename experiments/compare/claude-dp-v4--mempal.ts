import { defineExperiment } from "niceeval";
import { claudeCodeAgent } from "niceeval/adapter";
import { dockerSandbox } from "niceeval/sandbox";
import {
  MEMPAL_CLAUDE_DOCKER_IMAGE,
  mempalClaudeConfig,
  mempalFlags,
  mempalLoadState,
  mempalPrepare,
  mempalSaveState,
} from "../shared/mempal.ts";

// claude-dp-v4 的 mempal 变体:同模型同沙箱,只多一层 mempal 记忆条件 ——
// mempal CLI(agent 用自带 shell 跑 `mempal search` / `mempal ingest`,Skill 教它怎么用)+
// Stop hook(session 收尾提示存决策,由 adapter 的 settingsFile 接线)。不走 MCP:mempal 的 MCP 暴露
// 25 个工具、tools/list 82 KB,每轮重发,成本压过记忆本身(见 shared/mempal.ts 文件头注)。
// 对照 claude-dp-v4.ts 看 pass 率与效率(时间/token/重复失败命令)的差异。
//
// 前提:先从 NiceEval release-pinned Claude Docker 基底构建专用 Mempal 镜像。
// 注意:Stop hook 每 session 会多出一轮「存记忆」,该开销计入本条件的成本,是被测的一部分。
// host checkpoint 按 cohort × Experiment × Eval Group 隔离并跨 run 累积。正式比较用新的
// `MEMPAL_COHORT` 从空状态起跑，并把 cohort 记进 flags；不需要删除其它批次的 checkpoint。
export default defineExperiment({
  evals: ["react-hook-form/", "react-datepicker/", "downshift/", "react-tooltip/", "yet-another-react-lightbox/", "toggl-cli/"],
  description: "claude-code · deepseek-v4-flash · mempal",
  labels: { line: "claude" },  // 报告归类:同 line 值连成一条线(baseline → 变体),见 niceeval docs「labels」
  agent: claudeCodeAgent({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL,
    ...mempalClaudeConfig(),
  }),
  flags: mempalFlags(),
  model: "deepseek-v4-flash",
  // Eval Group 复用边界保持不变；每个 Group 在自己的 Docker lane 内串行，Group 间仍并行。
  sandbox: dockerSandbox({ source: { type: "image", image: MEMPAL_CLAUDE_DOCKER_IMAGE }, lifetimeMs: 60 * 60_000 })
    .prepare(mempalPrepare("claude"))
    .setup(mempalLoadState)
    .teardown(mempalSaveState),
  attempts: 1,
  earlyExit: true,
  // Group 内串行，Group 间并行；checkpoint 路径带 Group ID，不会互相覆盖。
  maxConcurrency: 6,
  timeoutMs: 1200000,
});
