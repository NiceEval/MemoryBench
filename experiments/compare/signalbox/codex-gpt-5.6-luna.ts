import { defineExperiment } from "niceeval";
import { codexAgent } from "niceeval/adapter";
import { e2bSandbox } from "niceeval/sandbox";
import { NICEEVAL_CODEX_E2B_TEMPLATE } from "niceeval/sandbox/e2b-template";

export default defineExperiment({
  evals: ["signalbox/"],
  description: "Signalbox history · codex · gpt-5.6-luna · no memory",
  labels: { line: "signalbox-codex" },
  agent: codexAgent(),
  flags: { memory: "baseline", trajectory: "signalbox-v1" },
  model: "gpt-5.6-luna",
  sandbox: e2bSandbox({ template: NICEEVAL_CODEX_E2B_TEMPLATE, lifetimeMs: 60 * 60_000 }),
  attempts: 1,
  earlyExit: false,
  // 顺序本身是实验契约；baseline 也串行，避免与记忆条件使用不同的调度轨迹。
  maxConcurrency: 1,
  timeoutMs: 1_200_000,
});
