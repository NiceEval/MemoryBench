import type { SandboxCommand } from "niceeval/sandbox";

export interface DependencyInstallOptions {
  readonly name: string;
  readonly revision: string;
  readonly commands: readonly [SandboxCommand, ...SandboxCommand[]];
}

/**
 * 依赖安装是每条 Attempt 的 Sandbox 准备工作，不是 Plugin。
 *
 * 保留传入 action 的原始表示，避免把声明式 shell action 包进 callback 后变成 cache barrier。
 * `name` / `revision` 仍作为调用点的显式审阅信息；action 内容本身由 NiceEval 自动 fingerprint。
 */
export function dependencyInstall({ name, revision, commands }: DependencyInstallOptions): SandboxCommand {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    throw new TypeError("dependency install name must be a stable lowercase identifier");
  }
  if (revision.trim() === "") {
    throw new TypeError("dependency install revision must be non-empty");
  }

  if (commands.length !== 1) {
    throw new TypeError("dependency install expects one composed declarative command");
  }
  return commands[0];
}
