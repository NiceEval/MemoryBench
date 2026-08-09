import { defineExperiment } from "niceeval";
import { codexAgent } from "niceeval/adapter";
import { dockerImageSandbox } from "niceeval/sandbox";
import {
  mempalFlags,
  mempalLoadState,
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
  description: "Signalbox history · codex · gpt-5.6-luna · mempal",
  labels: { line: "signalbox-codex" },
  agent: codexAgent({ skills: [signalboxMemorySkill] }),
  flags: { ...mempalFlags(), trajectory: "signalbox-v1" },
  model: "gpt-5.6-luna",
  // Signalbox 的单一 Eval Group 维持它自己的串行、可复用 Docker lane；共享 checkpoint 不新增第二层复用。
  sandbox: dockerImageSandbox({ image: MEMPAL_CODEX_DOCKER_IMAGE, lifetimeMs: 60 * 60_000 })
    .prepare(mempalPrepare("codex"))
    .setup(mempalLoadState)
    .teardown(mempalSaveState),
  attempts: 1,
  earlyExit: false,
  maxConcurrency: 1,
  timeoutMs: 1_200_000,
});
