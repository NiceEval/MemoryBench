import { shell } from "niceeval/sandbox";
import { dependencyInstall } from "../../plugins/dependency-install.ts";
import { gitRepository } from "../../plugins/git-checkout.ts";

const repository = gitRepository({
  repository: "https://github.com/ReactTooltip/react-tooltip.git",
  instanceKey: "react-tooltip",
});

const installDependencies = dependencyInstall({
  name: "react-tooltip",
  revision: "1",
  commands: [shell("yarn install --ignore-scripts --ignore-engines")],
});

export const prepareRepo = (baseCommit: string) => [
  repository.checkout({ commit: baseCommit, acceptCohortObjectVisibility: true }),
  installDependencies,
] as const;
