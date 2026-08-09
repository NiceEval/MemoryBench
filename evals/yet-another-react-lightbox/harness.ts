import { defineSandboxCommand } from "niceeval/sandbox";

const REPO_URL = "https://github.com/igordanchenko/yet-another-react-lightbox.git";

export const prepareRepo = (baseCommit: string) =>
  defineSandboxCommand(
    {
      id: "memorybench.yet-another-react-lightbox.checkout",
      revision: "1",
      inputs: { baseCommit },
    },
    async (sandbox, ctx) => {
      ctx.progress({ message: "cloning yet-another-react-lightbox @ base commit" });
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
          `yet-another-react-lightbox checkout failed: ${(cloned.stderr || cloned.stdout).trim().slice(-500)}`,
        );
      }
    },
  );
