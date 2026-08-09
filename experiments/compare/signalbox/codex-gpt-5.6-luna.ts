import { defineExperiment } from "niceeval";
import { codexAgent } from "niceeval/adapter";
import { dockerImageSandbox, NICEEVAL_CODEX_DOCKER_IMAGE } from "niceeval/sandbox";

export default defineExperiment({
  evals: ["signalbox/"],
  description: "Signalbox history · codex · gpt-5.6-luna · no memory",
  labels: { line: "signalbox-codex" },
  agent: codexAgent(),
  flags: { memory: "baseline", trajectory: "signalbox-v1" },
  model: "gpt-5.6-luna",
  // Signalbox Eval Group 自己定义串行复用；这里仅选择公开、版本钉死的 Codex Docker 环境。
  sandbox: dockerImageSandbox({ image: NICEEVAL_CODEX_DOCKER_IMAGE, lifetimeMs: 60 * 60_000 }),
  attempts: 1,
  earlyExit: false,
  // 顺序本身是实验契约；baseline 也串行，避免与记忆条件使用不同的调度轨迹。
  maxConcurrency: 1,
  timeoutMs: 1_200_000,
});
