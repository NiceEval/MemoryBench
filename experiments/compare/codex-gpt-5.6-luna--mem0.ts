import { defineExperiment } from "niceeval";
import { codexAgent } from "niceeval/adapter";
import { e2bSandbox } from "niceeval/sandbox";
import { NICEEVAL_CODEX_E2B_TEMPLATE } from "niceeval/sandbox/e2b-template";
import {
  mem0AttachRemote,
  mem0CodexConfig,
  mem0Flags,
  MEM0_PROVENANCE_FLAGS,
  mem0VerifyRemoteAlive,
} from "../shared/mem0.ts";

// codex-gpt-5.6-luna 的 Mem0 变体:同模型同沙箱,只多一层 Mem0 记忆条件 ——
// 官方 codex 集成(远程 HTTP MCP 读/写路径 + 插件 lifecycle hooks + 评测 Skill)。
// 接线已在 dev-e2b/codex-gpt-5.4-mini--mem0 冒烟;对照 baseline / mempal / nowledge
// 看 pass 率与效率(时间/token/重复失败命令)的差异。
//
// Mem0 Platform 是长期运行的固定远程实例(连接坐标在 .env,见 shared/mem0.ts):
// niceeval 侧不管服务端生命周期,沙箱钩子负责接线与收尾核对,记忆跨 run / 跨实验持续积累。
// 正式对比要说清起点库状态(同一 MEM0_USER_ID);归零 = 清该 user 下 memories 或换 MEM0_USER_ID。
export default defineExperiment({
  evals: ["react-hook-form/", "react-datepicker/", "downshift/", "react-tooltip/", "yet-another-react-lightbox/", "toggl-cli/"],
  description: "codex · gpt-5.6-luna · Mem0",
  labels: { line: "codex" },
  agent: codexAgent(mem0CodexConfig()),
  flags: { ...mem0Flags() },
  provenanceFlags: MEM0_PROVENANCE_FLAGS,
  model: "gpt-5.6-luna",
  sandbox: e2bSandbox({ template: NICEEVAL_CODEX_E2B_TEMPLATE })
    .setup(mem0AttachRemote())
    .teardown(mem0VerifyRemoteAlive()),
  runs: 1,
  earlyExit: false,
  // 中心化 Platform 自理并发读写,不压成串行(同 nowledge)。
  maxConcurrency: 4,
  timeoutMs: 1_200_000,
});
