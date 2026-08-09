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
const installPnpm: SandboxHook = async (sandbox, ctx) => {
  ctx.progress({ message: `installing pnpm ${PNPM_VERSION} for the Eval Group` });
  const installed = await sandbox.runShell(
    `npm install -g --force --prefix /usr/local pnpm@${PNPM_VERSION}`,
  );
  if (installed.exitCode !== 0) {
    throw new Error(
      `pnpm install failed: ${(installed.stderr || installed.stdout).trim().slice(-500)}`,
    );
  }
};

export default defineEvalGroup({
  // Group setup 只安装不依赖题目 checkout 的全局工具链；每条成员 prepare 在 clone 后
  // 重放项目依赖安装，符合 setup → reset anchor → per-Attempt prepare 的生命周期。
  sandbox: sandboxLayer().setup(installPnpm),
  evals: [pr13476, pr13512, pr13515, pr13566, pr13579, pr13594, pr13599, pr13603],
});
