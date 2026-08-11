import {
  definePlugin,
  type PluginInstance,
} from "niceeval/plugin";
import {
  sandboxLayer,
  type SandboxCommand,
} from "niceeval/sandbox";

export interface DependencyInstallOptions {
  readonly name: string;
  readonly revision: string;
  readonly commands: readonly [SandboxCommand, ...SandboxCommand[]];
}

const dependencyInstallFamily = definePlugin<DependencyInstallOptions>({
  name: "memorybench.dependency-install",
  behaviorRevision: "1",
  instanceKey: ({ name, revision }) => `${name}@${revision}`,
  eval: ({ name, revision, commands }) => {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
      throw new TypeError("dependency install name must be a stable lowercase identifier");
    }
    if (revision.trim() === "") {
      throw new TypeError("dependency install revision must be non-empty");
    }
    let sandbox = sandboxLayer();
    for (const command of commands) sandbox = sandbox.prepare(command);
    return {
      identity: { name, revision },
      sandbox,
    };
  },
});

/** Keep dependency work separate from repository materialization and checkout. */
export function dependencyInstall(options: DependencyInstallOptions): PluginInstance<"eval"> {
  return dependencyInstallFamily(options);
}
