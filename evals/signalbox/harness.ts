import { commandSucceeded } from "niceeval/expect";
import type { TestContext } from "niceeval";

const HIDDEN_TEST = ".niceeval-hidden.test.js";

export const runHiddenTest = async (t: TestContext, source: URL) => {
  await t.sandbox.uploadFile(source, HIDDEN_TEST);
  const result = await t.sandbox.runCommand("node", ["--test", HIDDEN_TEST]);
  await t.sandbox.runCommand("rm", [HIDDEN_TEST]);
  t.check(result, commandSucceeded());
};

export const signalboxMetadata = (
  sequence: number,
  phase: "learn" | "checkpoint" | "update" | "interference" | "revoke",
  memoryOperation: "addition" | "retrieval" | "interference" | "update" | "scope" | "forgetting",
) => ({
  suite: "signalbox",
  simulatedTeam: "Orion Support",
  sequence,
  phase,
  memoryOperation,
  checkpoint: phase === "checkpoint",
});
