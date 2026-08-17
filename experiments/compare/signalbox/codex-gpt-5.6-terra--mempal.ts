import { defineExperiment } from "niceeval";
import { codexAgent } from "niceeval/adapter";
import { dockerSandbox } from "niceeval/sandbox";
import {
  mempalLoadState,
  mempalCodexConfig,
  mempalFlags,
  mempalPrepare,
  mempalSaveState,
  MEMPAL_CODEX_DOCKER_IMAGE,
} from "../../shared/mempal.ts";

const signalboxMemorySkill = {
  kind: "local" as const,
  path: "experiments/compare/signalbox/mempal-skill",
  name: "signalbox-history-memory",
};

export default defineExperiment({
  evals: ["signalbox/"],
  description: "Signalbox history · codex · gpt-5.6-terra · mempal",
  labels: { line: "signalbox-codex" },
  agent: codexAgent(mempalCodexConfig(signalboxMemorySkill)),
  flags: { ...mempalFlags(), trajectory: "signalbox-v1" },
  model: "gpt-5.6-terra",
  // Signalbox 的单一 Eval Group 维持它自己的串行、可复用 Docker lane；共享 checkpoint 不新增第二层复用。
  sandbox: dockerSandbox({ source: { type: "image", image: MEMPAL_CODEX_DOCKER_IMAGE }, lifetimeMs: 60 * 60_000 })
    .prepare(mempalPrepare("codex"))
    .setup(mempalLoadState)
    .teardown(mempalSaveState),
  attempts: 1,
  earlyExit: false,
  maxConcurrency: 1,
  timeoutMs: 1_200_000,
});
