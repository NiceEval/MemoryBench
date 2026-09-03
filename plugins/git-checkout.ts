import { changeFrequency, shell, type SandboxAction } from "niceeval/sandbox";

export interface GitRepositoryOptions {
  readonly repository: string;
  readonly into?: string;
  readonly instanceKey?: string;
}

export interface GitCheckoutOptions {
  readonly commit: string;
  /** 保留显式确认，避免调用方无意扩大固定 Git 对象的可见范围。 */
  readonly acceptCohortObjectVisibility: true;
}

/**
 * MemoryBench 的复用安全 checkout。不同 Eval 共用同一物理 Sandbox 时，前一题的
 * checkout 会留在 workspace；每次先清空 workspace，再检出固定 commit。
 */
export function gitRepository(options: GitRepositoryOptions): {
  checkout(options: GitCheckoutOptions): SandboxAction;
} {
  const repository = new URL(options.repository);
  if (repository.protocol !== "https:" || repository.username || repository.password) {
    throw new TypeError("git repository must be a credential-free public HTTPS URL");
  }
  const id = options.instanceKey?.trim() || "repository";
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new TypeError("git repository instanceKey must be a stable identifier");
  }

  return Object.freeze({
    checkout(checkoutOptions: GitCheckoutOptions): SandboxAction {
      if (checkoutOptions.acceptCohortObjectVisibility !== true) {
        throw new TypeError("git checkout requires acceptCohortObjectVisibility: true");
      }
      if ((options.into ?? ".") !== ".") {
        throw new TypeError("MemoryBench git checkout currently requires the Sandbox workspace root");
      }
      const repositoryUrl = JSON.stringify(repository.href);
      const commit = JSON.stringify(checkoutOptions.commit);
      return shell({
        id: `memorybench.git-checkout.${id}`,
        command: [
          "set -eu",
          "find . -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +",
          "git init -q .",
          `git remote add origin ${repositoryUrl}`,
          `git fetch -q --depth 1 origin ${commit}`,
          "git checkout -q --detach FETCH_HEAD",
          `test "$(git rev-parse HEAD)" = ${commit}`,
        ].join("\n"),
        changeFrequency: changeFrequency.normal,
        cache: { fingerprint: { repository: repository.href, commit: checkoutOptions.commit, revision: 1 } },
      });
    },
  });
}
