import { defineEvalGroup } from "niceeval";
import { sandboxLayer } from "niceeval/sandbox";
import type { SandboxHook } from "niceeval/sandbox";
import pr970 from "./pr-970/eval.ts";
import pr1269 from "./pr-1269/eval.ts";
import pr1271 from "./pr-1271/eval.ts";
import pr1275 from "./pr-1275/eval.ts";
import pr1278 from "./pr-1278/eval.ts";
import pr1282 from "./pr-1282/eval.ts";

const YARN_VERSION = "1.22.22";
const installYarn: SandboxHook = async (sandbox, ctx) => {
  ctx.progress({ message: `installing yarn ${YARN_VERSION} for the Eval Group` });
  const installed = await sandbox.runShell(
    `npm install -g --prefix /usr/local yarn@${YARN_VERSION}`,
  );
  if (installed.exitCode !== 0) {
    throw new Error(
      `yarn install failed: ${(installed.stderr || installed.stdout).trim().slice(-500)}`,
    );
  }
};

export default defineEvalGroup({
  onUnavailable: "stop-group",
  sandbox: sandboxLayer().setup(installYarn),
  evals: [pr970, pr1269, pr1271, pr1275, pr1278, pr1282],
});
