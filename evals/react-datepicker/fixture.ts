import { sandboxLayer, shell } from "niceeval/sandbox";
import { dependencyInstall } from "../../plugins/dependency-install.ts";
import { gitRepository } from "../../plugins/git-checkout.ts";

const repository = gitRepository({
  repository: "https://github.com/Hacker0x01/react-datepicker.git",
  instanceKey: "react-datepicker",
});

const installDependencies = dependencyInstall({
  name: "react-datepicker",
  revision: "1",
  commands: [shell("yarn install --immutable")],
});

export const prepareRepo = (baseCommit: string) =>
  sandboxLayer()
    .before(repository.checkout({ commit: baseCommit, acceptCohortObjectVisibility: true }))
    .before(installDependencies);
