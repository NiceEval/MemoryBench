import { defineExperiment } from "niceeval";
import { codexAgent } from "niceeval/adapter";
import { e2bSandbox } from "niceeval/sandbox";
import {
  mempalFlags,
  mempalLoadState,
  mempalPrepare,
  mempalSaveState,
  mempalTemplate,
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
  sandbox: e2bSandbox({ template: mempalTemplate("codex"), lifetimeMs: 60 * 60_000 })
    .prepare(mempalPrepare("codex"))
    .setup(mempalLoadState)
    .teardown(mempalSaveState),
  attempts: 1,
  earlyExit: false,
  maxConcurrency: 1,
  timeoutMs: 1_200_000,
});
