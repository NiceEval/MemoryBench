import { shell } from "niceeval/sandbox";
import { dependencyInstall } from "../../plugins/dependency-install.ts";
import { gitRepository } from "../../plugins/git-checkout.ts";

const repository = gitRepository({
  repository: "https://github.com/downshift-js/downshift.git",
  instanceKey: "downshift",
});

const installDependencies = dependencyInstall({
  name: "downshift",
  revision: "1",
  commands: [
    shell(
      [
        "set -euo pipefail",
        "CYPRESS_INSTALL_BINARY=0 npm install --legacy-peer-deps --ignore-scripts",
        "npm install --no-save --save-exact --legacy-peer-deps --ignore-scripts " +
          "@babel/plugin-proposal-private-property-in-object@7.21.11 " +
          "@babel/plugin-proposal-private-methods@7.18.6",
      ].join("\n"),
    ),
  ],
});

export const prepareRepo = (baseCommit: string) => [
  repository.checkout({ commit: baseCommit, acceptCohortObjectVisibility: true }),
  installDependencies,
] as const;
