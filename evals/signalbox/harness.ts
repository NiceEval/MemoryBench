import { commandSucceeded } from "niceeval/expect";
import type { TestContext } from "niceeval";
import { sandboxLayer, type SandboxHook } from "niceeval/sandbox";

const WORKSPACE = new URL("../../workspaces/signalbox/", import.meta.url);
const HIDDEN_TEST = ".niceeval-hidden.test.js";

const prepareWorkspace: SandboxHook = async (sandbox, ctx) => {
  ctx.progress({ message: "uploading the Signalbox starter repository" });
  await sandbox.uploadDirectory(WORKSPACE);
  const baseline = await sandbox.runCommand("npm", ["test"]);
  if (baseline.exitCode !== 0) {
    throw new Error(`Signalbox baseline tests failed: ${baseline.stderr || baseline.stdout}`);
  }
};

export const signalboxSandbox = () => sandboxLayer().setup(prepareWorkspace);

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
