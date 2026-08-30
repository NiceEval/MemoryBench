import { defineExperiment } from "niceeval";
import { dockerSandbox } from "niceeval/sandbox";
import { codexAgent } from "niceeval/adapter";
import {
  mempalCodexConfig,
  mempalFlags,
  mempalLoadState,
  mempalPrepare,
  mempalSaveState,
} from "../shared/mempal.ts";
import { CODEX_BASE_IMAGE, memorybenchBaseSetup } from "../shared/sandbox-base.ts";

// codex-mempal 变体:agent 用自带 shell 跑 mempal CLI(`search` / `ingest`),
// Skill 教它先搜索、后写入耐久决策。不走 MCP(见 shared/mempal.ts 文件头注)。
//
// 环境从 NiceEval release-pinned Codex 官方镜像起步；稳定安装与 embedding 预热由
// SetupPrefix cache 自动构建并复用，不要求本地预构建镜像。
// host checkpoint 按 cohort × Experiment × Eval Group 隔离并跨 run 累积。正式比较用新的
// `MEMPAL_COHORT` 从空状态起跑，并把 cohort 记进 flags；不需要删除其它批次的 checkpoint。
export default defineExperiment({
  evals: ["react-hook-form/", "react-datepicker/", "downshift/", "react-tooltip/", "yet-another-react-lightbox/", "toggl-cli/"],
  description: "codex · gpt-5.6-luna · mempal",
  labels: { line: "codex", memory: "mempal" },  // 报告坐标必须随 sealed Run 保存，网页不读取私有 flags
  agent: codexAgent(mempalCodexConfig()),
  flags: mempalFlags(),
  model: "gpt-5.6-luna",
  // Eval Group 自己复用物理 Docker Sandbox；lifetimeMs 是每条长 Attempt 的明确容器寿命预算，
  // 不是云端账号配额。每个 Group 一条 lane，Group 间仍由 maxConcurrency 并行推进。
  sandbox: dockerSandbox({ source: { type: "image", image: CODEX_BASE_IMAGE }, lifetimeMs: 60 * 60_000, pathPrepend: ["/usr/local/bin"] })
    .before(memorybenchBaseSetup("codex"))
    .before(mempalPrepare("codex"))
    .before(mempalLoadState)
    .after(mempalSaveState),
  earlyExit: false,
  // Group 内串行复用，Group 间并行；host checkpoint 按 (Experiment, Group) 隔离。
  // One long-lived Sandbox pays the Rust install once for all 36 Attempts.
  maxConcurrency: 1,
  // 与 claude 组对齐(重型题可能超 10 分钟),消除条件间超时偏置——2026-07-10 重跑里
  // 本实验 repomod/terminal-cancel 正是死于 600s 默认超时(setup 含 ~514MB 模型预热)。
  // toggl-cli chain evals explicitly need a 30-minute agent deadline; keep the
  // experiment ceiling aligned so it does not truncate their per-eval timeout.
  timeoutMs: 1_800_000,
});
