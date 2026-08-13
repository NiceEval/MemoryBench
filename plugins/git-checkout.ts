import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { posix } from "node:path";
import {
  defineSandboxCommand,
  type SandboxCommand,
  type SandboxCommandContext,
  type SandboxCommandTarget,
} from "niceeval/sandbox";

type GitCheckoutDemand = {
  readonly repository: string;
  readonly repositoryKey: string;
  readonly commit: string;
  readonly into: string;
  readonly acceptCohortObjectVisibility: true;
};

export interface GitRepositoryOptions {
  readonly repository: string;
  readonly into?: string;
  readonly instanceKey?: string;
}

export interface GitCheckoutOptions {
  readonly commit: string;
  /** 已移除 cohort resource；保留显式确认，避免调用方无意扩大对象可见范围。 */
  readonly acceptCohortObjectVisibility: true;
}

const GIT_ENV = Object.freeze({
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "/bin/false",
});

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeRepository(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("git repository must be an absolute public HTTPS URL");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    isIP(hostname) !== 0
  ) {
    throw new TypeError("git repository must be a credential-free public HTTPS URL");
  }
  if (!url.pathname.endsWith(".git") || url.pathname === "/.git") {
    throw new TypeError("git repository URL must name a .git repository path");
  }
  return url.href;
}

function normalizeCommit(value: string): string {
  if (!/^[0-9a-fA-F]{40}$/.test(value)) {
    throw new TypeError("git checkout commit must be a full 40-character object ID");
  }
  return value.toLowerCase();
}

function normalizeInto(value: string | undefined): string {
  if (value === undefined || value === ".") return ".";
  if (value.startsWith("/") || value.includes("\\") || value.includes("\0")) {
    throw new TypeError("git checkout into must be a safe relative POSIX path");
  }
  const parts = value.split("/");
  if (
    parts.some((part) => part === "" || part === "." || part === "..") ||
    !parts.every((part) => /^[a-zA-Z0-9._-]+$/.test(part))
  ) {
    throw new TypeError("git checkout into must be a safe relative POSIX path");
  }
  return parts.join("/");
}

async function clearCheckoutTarget(
  sandbox: SandboxCommandTarget,
  target: string,
  context: SandboxCommandContext,
): Promise<void> {
  await sandbox.runCommandOrThrow("mkdir", ["-p", "--", target], { signal: context.signal });
  await sandbox.runShellOrThrow(
    "find . -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +",
    { cwd: target, signal: context.signal },
  );
}

function checkoutCommand(demand: GitCheckoutDemand): SandboxCommand {
  return defineSandboxCommand(
    {
      id: "memorybench.git-checkout",
      // v3 removes the retired cross-eval Sandbox resource. A fresh fetch is now explicit
      // per Attempt, while the locked repository URL and commit remain part of the command identity.
      revision: "3",
      inputs: {
        repository: demand.repository,
        repositoryKey: demand.repositoryKey,
        commit: demand.commit,
        into: demand.into,
      },
    },
    async (sandbox, context) => {
      const target = demand.into === "."
        ? sandbox.workdir
        : posix.join(sandbox.workdir, demand.into);
      context.progress({ message: `checking out ${demand.repositoryKey}@${demand.commit.slice(0, 12)}` });

      await clearCheckoutTarget(sandbox, target, context);
      await sandbox.runCommandOrThrow("git", ["init", "--quiet"], {
        cwd: target,
        env: GIT_ENV,
        signal: context.signal,
      });
      await sandbox.runCommandOrThrow("git", ["config", "--local", "core.logAllRefUpdates", "false"], {
        cwd: target,
        env: GIT_ENV,
        signal: context.signal,
      });
      await sandbox.runCommandOrThrow(
        "git",
        ["fetch", "--quiet", "--no-tags", "--depth=1", demand.repository, demand.commit],
        { cwd: target, env: GIT_ENV, signal: context.signal },
      );
      await sandbox.runCommandOrThrow("git", ["checkout", "--quiet", "--detach", demand.commit], {
        cwd: target,
        env: GIT_ENV,
        signal: context.signal,
      });
      await sandbox.runCommandOrThrow("rm", ["-f", "--", ".git/FETCH_HEAD"], {
        cwd: target,
        signal: context.signal,
      });
      await sandbox.runShellOrThrow(
        [
          "set -euo pipefail",
          `test \"$(git rev-parse HEAD)\" = ${demand.commit}`,
          "! git symbolic-ref -q HEAD >/dev/null 2>&1",
          'test -z "$(git remote)"',
          "test -z \"$(git for-each-ref --format='%(refname)')\"",
          "! git config --local --name-only --get-regexp '^(remote|credential)\\.'",
        ].join("\n"),
        { cwd: target, env: GIT_ENV, signal: context.signal },
      );
    },
  );
}

export function gitRepository(options: GitRepositoryOptions): {
  checkout(options: GitCheckoutOptions): SandboxCommand;
} {
  const repository = normalizeRepository(options.repository);
  const into = normalizeInto(options.into);
  const repositoryKey = options.instanceKey?.trim() || hash(`${repository}\0${into}`).slice(0, 16);
  if (!/^[a-zA-Z0-9._-]+$/.test(repositoryKey)) {
    throw new TypeError("git repository instanceKey must be a stable identifier");
  }
  return Object.freeze({
    checkout(checkoutOptions: GitCheckoutOptions): SandboxCommand {
      if (checkoutOptions.acceptCohortObjectVisibility !== true) {
        throw new TypeError("git checkout requires acceptCohortObjectVisibility: true");
      }
      return checkoutCommand({
        repository,
        repositoryKey,
        commit: normalizeCommit(checkoutOptions.commit),
        into,
        acceptCohortObjectVisibility: true,
      });
    },
  });
}
