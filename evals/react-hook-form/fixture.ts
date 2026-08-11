import { defineSandboxCommand } from "niceeval/sandbox";

const REPO_URL = "https://github.com/react-hook-form/react-hook-form.git";

export const prepareRepo = (baseCommit: string) =>
  defineSandboxCommand(
    {
      id: "memorybench.react-hook-form.checkout",
      revision: "2",
      inputs: { baseCommit },
    },
    async (sandbox, ctx) => {
      ctx.progress({ message: "cloning react-hook-form @ base commit" });
      const cloned = await sandbox.runShell(
        [
          "set -euo pipefail",
          // .git 不由题间 workdir reset 恢复；每题重新建立只含目标 base 的历史。
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
          `react-hook-form checkout failed: ${(cloned.stderr || cloned.stdout).trim().slice(-500)}`,
        );
      }
      ctx.progress({ message: "installing react-hook-form dependencies" });
      const installed = await sandbox.runShell(
        "CYPRESS_INSTALL_BINARY=0 pnpm install --no-frozen-lockfile --ignore-scripts",
      );
      if (installed.exitCode !== 0) {
        throw new Error(
          `react-hook-form dependency install failed: ${(installed.stderr || installed.stdout).trim().slice(-500)}`,
        );
      }
    },
  );
