import { defineEvalGroup } from "niceeval";
import { defineSandboxCommand, sandboxLayer } from "niceeval/sandbox";
import pr13476 from "./pr-13476/eval.ts";
import pr13512 from "./pr-13512/eval.ts";
import pr13515 from "./pr-13515/eval.ts";
import pr13566 from "./pr-13566/eval.ts";
import pr13579 from "./pr-13579/eval.ts";
import pr13594 from "./pr-13594/eval.ts";
import pr13599 from "./pr-13599/eval.ts";
import pr13603 from "./pr-13603/eval.ts";

const PNPM_VERSION = "10.34.5";
const installPnpm = defineSandboxCommand(
  {
    id: "memorybench.react-hook-form.install-pnpm",
    revision: "1",
    inputs: { version: PNPM_VERSION },
  },
  async (sandbox, ctx) => {
    ctx.progress({ message: `installing pnpm ${PNPM_VERSION}` });
    const installed = await sandbox.runShell(
      `npm install -g --force --prefix /usr/local pnpm@${PNPM_VERSION}`,
    );
    if (installed.exitCode !== 0) {
      throw new Error(
        `pnpm bootstrap failed: ${(installed.stderr || installed.stdout).trim().slice(-500)}`,
      );
    }
  },
);

export default defineEvalGroup({
  // Group Sandbox 共用同一套包管理器与 pnpm store；各题仍须在切到自己的
  // BASE_COMMIT 后执行 pnpm install，因为这些 commit 的 lockfile 并不相同。
  sandbox: sandboxLayer().prepare(installPnpm),
  evals: [pr13476, pr13512, pr13515, pr13566, pr13579, pr13594, pr13599, pr13603],
});
