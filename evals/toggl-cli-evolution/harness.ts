import { sandboxLayer } from "niceeval/sandbox";

import {
  installRustToolchain,
  prepareRepo,
  type ProbeCase,
} from "../toggl-cli/harness.ts";

export {
  orderedLines,
  runProbe,
  type ProbeCase,
  type ProbePlan,
} from "../toggl-cli/harness.ts";

/** 每道题仍从同一 base commit 开始；跨题只允许记忆系统传递产品约定。 */
export const evolutionSandbox = () =>
  sandboxLayer().prepare(installRustToolchain).prepare(prepareRepo);

export const asJson = (probeCase: ProbeCase): unknown => {
  try {
    return JSON.parse(probeCase.stdout.trim());
  } catch {
    return { parseError: probeCase.stdout };
  }
};

export const evolutionMetadata = (
  sequence: number,
  phase: "learn" | "checkpoint" | "update" | "revoke",
  memoryOperation: "addition" | "retrieval" | "update" | "scoped-conflict" | "forgetting",
) => ({
  suite: "toggl-cli-evolution",
  simulatedUser: "northstar-ops",
  sequence,
  phase,
  memoryOperation,
  checkpoint: phase === "checkpoint",
});
