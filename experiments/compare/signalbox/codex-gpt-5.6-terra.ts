import { defineExperiment } from "niceeval";
import { codexAgent } from "niceeval/adapter";
import { dockerSandbox, NICEEVAL_CODEX_DOCKER_IMAGE } from "niceeval/sandbox";

export default defineExperiment({
  evals: ["signalbox/"],
  description: "Signalbox history · codex · gpt-5.6-terra · no memory",
  labels: { line: "signalbox-codex" },
  agent: codexAgent(),
  flags: { memory: "baseline", trajectory: "signalbox-v1" },
  model: "gpt-5.6-terra",
  // Signalbox Eval Group 自己定义串行复用；这里仅选择公开、版本钉死的 Codex Docker 环境。
  sandbox: dockerSandbox({ source: { type: "image", image: NICEEVAL_CODEX_DOCKER_IMAGE }, lifetimeMs: 60 * 60_000 }),
  attempts: 1,
  earlyExit: false,
  // 先保持单并发，避免条件间引入额外并发差异；这不构成业务顺序契约。
  maxConcurrency: 1,
  timeoutMs: 1_200_000,
});
