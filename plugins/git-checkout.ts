import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { posix } from "node:path";
import { Effect } from "effect";
import {
  definePlugin,
  defineSandboxResource,
  type PluginInstance,
  type SandboxResourceContext,
} from "niceeval/plugin";
import type { Sandbox } from "niceeval/sandbox";

type GitCheckoutDemand = {
  readonly repository: string;
  readonly repositoryKey: string;
  readonly commit: string;
  readonly into: string;
  readonly acceptCohortObjectVisibility: true;
};

interface Seed {
  readonly path: string;
  readonly digest: string;
  readonly commits: ReadonlySet<string>;
}

interface GitCheckoutHandle {
  readonly root: string;
  readonly seeds: ReadonlyMap<string, Seed>;
}

export interface GitRepositoryOptions {
  readonly repository: string;
  readonly into?: string;
  readonly instanceKey?: string;
}

export interface GitCheckoutOptions {
  readonly commit: string;
  /** A cohort may see objects requested by another selected Eval, never refs or worktrees. */
  readonly acceptCohortObjectVisibility: true;
}

const GIT_ENV = Object.freeze({
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "/bin/false",
});

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function fromPromise<Value>(run: () => Promise<Value>): Effect.Effect<Value, Error> {
  return Effect.tryPromise({ try: run, catch: asError });
}

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

async function seedDigest(sandbox: Sandbox, seedPath: string, signal: AbortSignal): Promise<string> {
  const result = await sandbox.runShellOrThrow(
    [
      "set -euo pipefail",
      "{",
      "  find objects -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum",
      "  if [ -f shallow ]; then sha256sum shallow; fi",
      "} | sha256sum | awk '{print $1}'",
    ].join("\n"),
    { cwd: seedPath, env: GIT_ENV, signal },
  );
  const digest = result.stdout.trim();
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error("git seed digest was not sha256 output");
  return digest;
}

async function materializeRepository(
  sandbox: Sandbox,
  root: string,
  repository: string,
  commits: readonly string[],
  context: SandboxResourceContext,
): Promise<Seed> {
  const seedPath = posix.join(root, hash(repository).slice(0, 24));
  const startedAt = Date.now();
  context.progress({ message: `fetching ${repository} (${commits.length} revision${commits.length === 1 ? "" : "s"})` });
  await sandbox.runCommandOrThrow("mkdir", ["-p", "--", seedPath], { signal: context.signal });
  await sandbox.runCommandOrThrow("git", ["init", "--quiet", "--bare", seedPath], {
    env: GIT_ENV,
    signal: context.signal,
  });
  await sandbox.runCommandOrThrow(
    "git",
    ["-C", seedPath, "fetch", "--quiet", "--no-tags", "--depth=1", repository, ...commits],
    { env: GIT_ENV, signal: context.signal },
  );
  for (const commit of commits) {
    await sandbox.runCommandOrThrow("git", ["-C", seedPath, "cat-file", "-e", `${commit}^{commit}`], {
      env: GIT_ENV,
      signal: context.signal,
    });
  }
  await sandbox.runCommandOrThrow(
    "rm",
    ["-rf", "--", `${seedPath}/FETCH_HEAD`, `${seedPath}/hooks`, `${seedPath}/refs`, `${seedPath}/logs`, `${seedPath}/branches`],
    { signal: context.signal },
  );
  await sandbox.runCommandOrThrow("rm", ["-f", "--", `${seedPath}/objects/info/alternates`], {
    signal: context.signal,
  });
  const digest = await seedDigest(sandbox, seedPath, context.signal);
  const url = new URL(repository);
  context.timing({
    key: "git.seed.fetch",
    label: `${url.hostname}/${url.pathname.replace(/^\//, "")}`,
    durationMs: Date.now() - startedAt,
  });
  return Object.freeze({ path: seedPath, digest, commits: new Set(commits) });
}

const gitCheckoutResource = defineSandboxResource<"docker", GitCheckoutDemand, GitCheckoutHandle>({
  receiver: "docker",
  behaviorRevision: "1",
  demand: ({ repository, commit, into, acceptCohortObjectVisibility }) => ({
    repository,
    commit,
    into,
    acceptCohortObjectVisibility,
  }),
  materialize: (demands, context) => fromPromise(async () => {
    const root = `/tmp/niceeval-git-${hash(context.physicalId).slice(0, 20)}`;
    await context.sandbox.runCommandOrThrow("rm", ["-rf", "--", root], { signal: context.signal });
    await context.sandbox.runCommandOrThrow("mkdir", ["-p", "--", root], { signal: context.signal });
    const byRepository = new Map<string, Set<string>>();
    for (const demand of demands) {
      const commits = byRepository.get(demand.repository) ?? new Set<string>();
      commits.add(demand.commit);
      byRepository.set(demand.repository, commits);
    }
    const seeds = new Map<string, Seed>();
    let revisionCount = 0;
    for (const repository of [...byRepository.keys()].sort()) {
      const commits = [...byRepository.get(repository)!].sort();
      revisionCount += commits.length;
      seeds.set(
        repository,
        await materializeRepository(context.sandbox, root, repository, commits, context),
      );
    }
    context.fact("git.seed.repository_count", seeds.size);
    context.fact("git.seed.revision_count", revisionCount);
    context.fact("git.seed.fetch_count", seeds.size);
    return Object.freeze({ root, seeds });
  }),
  prepare: (handle, demand, context) => fromPromise(async () => {
    const seed = handle.seeds.get(demand.repository);
    if (seed === undefined || !seed.commits.has(demand.commit)) {
      throw new Error(`selected Git seed does not contain ${demand.commit}`);
    }
    const startedAt = Date.now();
    const currentDigest = await seedDigest(context.sandbox, seed.path, context.signal);
    if (currentDigest !== seed.digest) {
      throw new Error(`Git seed digest changed for ${demand.repository}`);
    }
    const target = demand.into === "."
      ? context.sandbox.workdir
      : posix.join(context.sandbox.workdir, demand.into);
    await context.sandbox.runCommandOrThrow("mkdir", ["-p", "--", target], { signal: context.signal });
    await context.sandbox.runShellOrThrow(
      "find . -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +",
      { cwd: target, signal: context.signal },
    );
    await context.sandbox.runCommandOrThrow("git", ["init", "--quiet"], {
      cwd: target,
      env: GIT_ENV,
      signal: context.signal,
    });
    await context.sandbox.runCommandOrThrow("git", ["config", "--local", "core.logAllRefUpdates", "false"], {
      cwd: target,
      env: GIT_ENV,
      signal: context.signal,
    });
    await context.sandbox.runCommandOrThrow("rm", ["-rf", "--", posix.join(target, ".git/objects")], {
      signal: context.signal,
    });
    await context.sandbox.runCommandOrThrow("mkdir", ["-p", "--", posix.join(target, ".git/objects")], {
      signal: context.signal,
    });
    await context.sandbox.runCommandOrThrow(
      "cp",
      ["-a", "--reflink=never", `${seed.path}/objects/.`, posix.join(target, ".git/objects/")],
      { signal: context.signal },
    );
    if (await context.sandbox.pathExists(`${seed.path}/shallow`)) {
      await context.sandbox.runCommandOrThrow(
        "cp",
        ["-a", "--reflink=never", `${seed.path}/shallow`, posix.join(target, ".git/shallow")],
        { signal: context.signal },
      );
    }
    await context.sandbox.runCommandOrThrow("git", ["checkout", "--quiet", "--detach", demand.commit], {
      cwd: target,
      env: GIT_ENV,
      signal: context.signal,
    });
    await context.sandbox.runCommandOrThrow(
      "rm",
      ["-rf", "--", posix.join(target, ".git/hooks"), posix.join(target, ".git/logs")],
      { signal: context.signal },
    );
    // Git itself requires the top-level refs directory in order to recognize
    // this as a repository. Keep that empty directory, but remove every ref.
    await context.sandbox.runShellOrThrow(
      "find .git/refs -mindepth 1 -exec rm -rf -- {} +",
      { cwd: target, signal: context.signal },
    );
    await context.sandbox.runCommandOrThrow("rm", ["-f", "--", posix.join(target, ".git/objects/info/alternates")], {
      signal: context.signal,
    });
    await context.sandbox.runShellOrThrow(
      [
        "set -euo pipefail",
        `test \"$(git rev-parse HEAD)\" = ${demand.commit}`,
        "! git symbolic-ref -q HEAD >/dev/null 2>&1",
        'test -z "$(git remote)"',
        "test -z \"$(git for-each-ref --format='%(refname)')\"",
        "test ! -e .git/objects/info/alternates",
        "test ! -d .git/hooks",
        "test ! -d .git/logs",
        "! find .git/objects -type f -links +1 -print -quit | grep -q .",
        "! git config --local --name-only --get-regexp '^(remote|credential)\\.'",
      ].join("\n"),
      { cwd: target, env: GIT_ENV, signal: context.signal },
    );
    context.progress({ message: `checked out ${demand.commit.slice(0, 12)} from shared Git seed` });
    context.timing({
      key: "git.checkout.prepare",
      label: demand.commit.slice(0, 12),
      durationMs: Date.now() - startedAt,
    });
  }),
  release: (handle, context) => fromPromise(async () => {
    await context.sandbox.runCommandOrThrow("rm", ["-rf", "--", handle.root], { signal: context.signal });
  }),
});

const gitCheckoutFamily = definePlugin<GitCheckoutDemand>({
  name: "memorybench.git-checkout",
  behaviorRevision: "1",
  instanceKey: ({ repositoryKey, commit, into }) => `${repositoryKey}:${into}:${commit}`,
  eval: (demand) => ({
    identity: {
      repository: demand.repository,
      repositoryKey: demand.repositoryKey,
      commit: demand.commit,
      into: demand.into,
      acceptCohortObjectVisibility: demand.acceptCohortObjectVisibility,
    },
    resources: [gitCheckoutResource(demand)],
  }),
});

export function gitRepository(options: GitRepositoryOptions): {
  checkout(options: GitCheckoutOptions): PluginInstance<"eval">;
} {
  const repository = normalizeRepository(options.repository);
  const into = normalizeInto(options.into);
  const repositoryKey = options.instanceKey?.trim() || hash(`${repository}\0${into}`).slice(0, 16);
  if (!/^[a-zA-Z0-9._-]+$/.test(repositoryKey)) {
    throw new TypeError("git repository instanceKey must be a stable identifier");
  }
  return Object.freeze({
    checkout(checkoutOptions: GitCheckoutOptions): PluginInstance<"eval"> {
      if (checkoutOptions.acceptCohortObjectVisibility !== true) {
        throw new TypeError("git checkout requires acceptCohortObjectVisibility: true");
      }
      return gitCheckoutFamily({
        repository,
        repositoryKey,
        commit: normalizeCommit(checkoutOptions.commit),
        into,
        acceptCohortObjectVisibility: true,
      });
    },
  });
}
