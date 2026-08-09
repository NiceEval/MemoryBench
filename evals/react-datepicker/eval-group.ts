import { defineEvalGroup } from "niceeval";
import { sandboxLayer } from "niceeval/sandbox";
import type { SandboxHook } from "niceeval/sandbox";
import pr6058 from "./pr-6058/eval.ts";
import pr6073 from "./pr-6073/eval.ts";
import pr6092 from "./pr-6092/eval.ts";
import pr6167 from "./pr-6167/eval.ts";
import pr6168 from "./pr-6168/eval.ts";
import pr6172 from "./pr-6172/eval.ts";
import pr6206 from "./pr-6206/eval.ts";

const installDependencies: SandboxHook = async (sandbox, ctx) => {
  ctx.progress({ message: "installing dependencies (corepack + yarn immutable)" });
  const installed = await sandbox.runShell("corepack enable && yarn install --immutable");
  if (installed.exitCode !== 0) {
    throw new Error(
      `yarn install failed: ${(installed.stderr || installed.stdout).trim().slice(-500)}`,
    );
  }
};

export default defineEvalGroup({
  sandboxReuse: true,
  sandbox: sandboxLayer().setup(installDependencies),
  evals: [pr6058, pr6073, pr6092, pr6167, pr6168, pr6172, pr6206],
});
