import { defineEvalGroup } from "niceeval";
import { sandboxLayer } from "niceeval/sandbox";
import type { SandboxHook } from "niceeval/sandbox";
import pr13476 from "./pr-13476/eval.ts";
import pr13512 from "./pr-13512/eval.ts";
import pr13515 from "./pr-13515/eval.ts";
import pr13566 from "./pr-13566/eval.ts";
import pr13579 from "./pr-13579/eval.ts";
import pr13594 from "./pr-13594/eval.ts";
import pr13599 from "./pr-13599/eval.ts";
import pr13603 from "./pr-13603/eval.ts";

const PNPM_VERSION = "10.34.5";
const installDependencies: SandboxHook = async (sandbox, ctx) => {
  ctx.progress({ message: `installing pnpm ${PNPM_VERSION} + dependencies` });
  const installed = await sandbox.runShell(
    `npm install -g --force --prefix /usr/local pnpm@${PNPM_VERSION} && ` +
      "CYPRESS_INSTALL_BINARY=0 pnpm install --no-frozen-lockfile --ignore-scripts",
  );
  if (installed.exitCode !== 0) {
    throw new Error(
      `pnpm install failed: ${(installed.stderr || installed.stdout).trim().slice(-500)}`,
    );
  }
};

export default defineEvalGroup({
  sandboxReuse: true,
  // Eval Group 本身就是复用边界：成员 prepare 先建立首题 checkout，group setup
  // 再安装依赖一次；后续成员从这份基线继续，只重建各自的 commit 专属 checkout。
  sandbox: sandboxLayer().setup(installDependencies),
  evals: [pr13476, pr13512, pr13515, pr13566, pr13579, pr13594, pr13599, pr13603],
});
