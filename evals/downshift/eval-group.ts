import { defineEvalGroup } from "niceeval";
import { sandboxLayer } from "niceeval/sandbox";
import type { SandboxHook } from "niceeval/sandbox";
import pr1414 from "./pr-1414/eval.ts";
import pr1456 from "./pr-1456/eval.ts";
import pr1458 from "./pr-1458/eval.ts";
import pr1484 from "./pr-1484/eval.ts";
import pr1587 from "./pr-1587/eval.ts";
import pr1603 from "./pr-1603/eval.ts";

const installDependencies: SandboxHook = async (sandbox, ctx) => {
  ctx.progress({ message: "installing npm dependencies" });
  const installed = await sandbox.runShell(
    [
      "set -euo pipefail",
      "CYPRESS_INSTALL_BINARY=0 npm install --legacy-peer-deps --ignore-scripts",
      "npm install --no-save --save-exact --legacy-peer-deps --ignore-scripts " +
        "@babel/plugin-proposal-private-property-in-object@7.21.11 " +
        "@babel/plugin-proposal-private-methods@7.18.6",
    ].join("\n"),
  );
  if (installed.exitCode !== 0) {
    throw new Error(
      `npm install failed: ${(installed.stderr || installed.stdout).trim().slice(-500)}`,
    );
  }
};

export default defineEvalGroup({
  sandboxReuse: true,
  sandbox: sandboxLayer().setup(installDependencies),
  evals: [pr1414, pr1456, pr1458, pr1484, pr1587, pr1603],
});
