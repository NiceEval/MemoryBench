import { defineExperiment } from "niceeval";
import { codexAgent } from "niceeval/adapter";
import { e2bSandbox } from "niceeval/sandbox";
import { NICEEVAL_CODEX_E2B_TEMPLATE } from "niceeval/sandbox/e2b-template";
import {
  mem0AttachRemote,
  mem0CodexConfig,
  mem0Flags,
  mem0VerifyRemoteAlive,
} from "../shared/mem0.ts";

// dev-e2b 的 Mem0 记忆条件冒烟:与 baseline(codex-gpt-5.4-mini.ts)同模型,
// 只叠加 Mem0 官方 codex 集成(远程 HTTP MCP + 插件 hooks + 评测 Skill)。
// Mem0 Platform 是 .env 里的固定远程实例(见 shared/mem0.ts 文件头),无生命周期,直接
// `pnpm exec niceeval exp dev-e2b/codex-gpt-5.4-mini--mem0 dogfood/` 即可。
// 注意:冒烟写入与后续 compare 实验进的是同一个 Mem0 user_id 库。
export default defineExperiment({
  evals: ["dogfood/"],
  description: "codex · gpt-5.4-mini + Mem0(dev-e2b:E2B 上的记忆条件冒烟)",
  agent: codexAgent(mem0CodexConfig()),
  flags: mem0Flags(),
  model: "gpt-5.4-mini",
  sandbox: e2bSandbox({ template: NICEEVAL_CODEX_E2B_TEMPLATE })
    .setup(mem0AttachRemote())
    .teardown(mem0VerifyRemoteAlive()),
  attempts: 1,
  earlyExit: true,
  // 中心化 Platform 自理并发;冒烟单 eval 无需压串行
  maxConcurrency: 2,
  timeoutMs: 1_200_000,
});
