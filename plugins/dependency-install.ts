import {
  defineSandboxCommand,
  type SandboxCommand,
} from "niceeval/sandbox";

export interface DependencyInstallOptions {
  readonly name: string;
  readonly revision: string;
  readonly commands: readonly [SandboxCommand, ...SandboxCommand[]];
}

/**
 * 依赖安装是每条 Attempt 的 Sandbox 准备工作，不是 Plugin。
 *
 * Plugin 当前只组合生命周期；命令的稳定身份由 `id`、`revision` 与 `inputs` 提供。
 */
export function dependencyInstall({ name, revision, commands }: DependencyInstallOptions): SandboxCommand {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    throw new TypeError("dependency install name must be a stable lowercase identifier");
  }
  if (revision.trim() === "") {
    throw new TypeError("dependency install revision must be non-empty");
  }

  return defineSandboxCommand(
    {
      id: "memorybench.dependency-install",
      revision,
      inputs: { name },
    },
    async (sandbox, ctx) => {
      ctx.progress({ message: `installing ${name} dependencies` });
      for (const command of commands) {
        await command(sandbox, ctx);
      }
    },
  );
}
