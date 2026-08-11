import { defineSandboxCommand } from "niceeval/sandbox";

const REPO_URL = "https://github.com/ReactTooltip/react-tooltip.git";

export const prepareRepo = (baseCommit: string) =>
  defineSandboxCommand(
    {
      id: "memorybench.react-tooltip.checkout",
      revision: "2",
      inputs: { baseCommit },
    },
    async (sandbox, ctx) => {
      ctx.progress({ message: "cloning react-tooltip @ base commit" });
      const cloned = await sandbox.runShell(
        [
          "set -euo pipefail",
          "rm -rf .git .niceeval-clone",
          `git clone -q -o origin --single-branch ${REPO_URL} .niceeval-clone`,
          "mv .niceeval-clone/.git .git",
          "rm -rf .niceeval-clone",
          `git reset -q --hard ${baseCommit}`,
          "git remote remove origin",
          "git tag -l | xargs -r git tag -d >/dev/null",
          "git reflog expire --expire=now --all",
          "git gc -q --prune=now",
          `TS=$(git show -s --format=%ci ${baseCommit})`,
          'COUNT=$(git log --oneline --since="$TS" | wc -l)',
          '[ "$COUNT" -eq 1 ]',
        ].join("\n"),
      );
      if (cloned.exitCode !== 0) {
        throw new Error(
          `react-tooltip checkout failed: ${(cloned.stderr || cloned.stdout).trim().slice(-500)}`,
        );
      }
      ctx.progress({ message: "installing react-tooltip dependencies" });
      const installed = await sandbox.runShell("yarn install --ignore-scripts --ignore-engines");
      if (installed.exitCode !== 0) {
        throw new Error(
          `react-tooltip dependency install failed: ${(installed.stderr || installed.stdout).trim().slice(-500)}`,
        );
      }
    },
  );
