import { defineEvalGroup } from "niceeval";
import { sandboxLayer } from "niceeval/sandbox";
import type { SandboxHook } from "niceeval/sandbox";
import commit5578052 from "./commit-5578052/eval.ts";
import commitF63f6af from "./commit-f63f6af/eval.ts";
import pr408 from "./pr-408/eval.ts";

const NODE_VERSION = "22.13.0";
const N_VERSION = "10.2.0";
const installDependencies: SandboxHook = async (sandbox, ctx) => {
  ctx.progress({ message: `installing Node ${NODE_VERSION} + dependencies` });
  const nodeSwapped = await sandbox.runShell(
    [
      "set -euo pipefail",
      `npm install -g --prefix /usr/local n@${N_VERSION}`,
      `n ${NODE_VERSION}`,
    ].join("\n"),
  );
  if (nodeSwapped.exitCode !== 0) {
    throw new Error(
      `Node runtime swap failed: ${(nodeSwapped.stderr || nodeSwapped.stdout).trim().slice(-500)}`,
    );
  }

  const nodeChecked = await sandbox.runShell(
    [
      "set -euo pipefail",
      'ACTUAL=$(node -p "process.version")',
      `EXPECTED="v${NODE_VERSION}"`,
      '[ "$ACTUAL" = "$EXPECTED" ] || {',
      '  echo "expected Node $EXPECTED, got $ACTUAL" >&2',
      "  exit 1",
      "}",
    ].join("\n"),
  );
  if (nodeChecked.exitCode !== 0) {
    throw new Error(
      `Node version check failed after swap: ${(nodeChecked.stderr || nodeChecked.stdout).trim().slice(-500)}`,
    );
  }

  const installed = await sandbox.runShell("npm install");
  if (installed.exitCode !== 0) {
    throw new Error(
      `npm install failed: ${(installed.stderr || installed.stdout).trim().slice(-500)}`,
    );
  }
};

export default defineEvalGroup({
  sandboxReuse: true,
  sandbox: sandboxLayer().setup(installDependencies),
  evals: [commit5578052, commitF63f6af, pr408],
});
