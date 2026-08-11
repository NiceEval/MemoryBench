import { shell } from "niceeval/sandbox";
import { dependencyInstall } from "../../plugins/dependency-install.ts";
import { gitRepository } from "../../plugins/git-checkout.ts";

const repository = gitRepository({
  repository: "https://github.com/igordanchenko/yet-another-react-lightbox.git",
  instanceKey: "yet-another-react-lightbox",
});

const installDependencies = dependencyInstall({
  name: "yet-another-react-lightbox",
  revision: "1",
  commands: [shell("npm install")],
});

export const prepareRepo = (baseCommit: string) => [
  repository.checkout({ commit: baseCommit, acceptCohortObjectVisibility: true }),
  installDependencies,
] as const;
