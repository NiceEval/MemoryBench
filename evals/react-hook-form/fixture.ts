import { sandboxLayer, shell } from "niceeval/sandbox";
import { dependencyInstall } from "../../plugins/dependency-install.ts";
import { gitRepository } from "../../plugins/git-checkout.ts";

const repository = gitRepository({
  repository: "https://github.com/react-hook-form/react-hook-form.git",
  instanceKey: "react-hook-form",
});

const installDependencies = dependencyInstall({
  name: "react-hook-form",
  revision: "1",
  commands: [shell("CYPRESS_INSTALL_BINARY=0 pnpm install --no-frozen-lockfile --ignore-scripts")],
});

export const prepareRepo = (baseCommit: string) =>
  sandboxLayer()
    .prepare(repository.checkout({ commit: baseCommit, acceptCohortObjectVisibility: true }))
    .prepare(installDependencies);
