// toggl-cli 链中每道代码题共用的单题 Fixture。
// 每道题都从同一个 base commit 开始，不继承前一题的代码改动。

import type { SandboxCommand, SandboxCommandContext } from "niceeval/sandbox";

const REPO_URL = "https://github.com/CorrectRoadH/toggl-cli.git";

/** toggl-cli @ 8646f29 —— 写这些 eval 时的仓库 tip。 */
export const BASE_COMMIT = "8646f29c87242b06eab974793a999d35b5a85b5e";

export const SANDBOX_DISK_LOW_THRESHOLD_KB = 4 * 1024 * 1024;

/** 只查一次根文件系统；/opt/cargo-target 是刻意保留的 Cargo 加速缓存。 */
export const SANDBOX_DISK_CHECK_COMMAND = [
  "set -euo pipefail",
  "df -Pk / 2>/dev/null",
  "du -sk /opt/cargo-target 2>/dev/null",
].join("\n");

export interface SandboxDiskObservation {
  free_kb: number;
  total_kb: number;
  build_tree_kb: number;
}

export interface SandboxDiskCheckResult {
  exitCode: number | null;
  stdout: string;
  stderr?: string;
}

type SandboxDiskFactsContext = Pick<SandboxCommandContext, "facts" | "diagnostic">;

const parseSafeNonNegativeInteger = (value: string): number | null => {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
};

const formatDiskSizeGiB = (kb: number): string => `${(kb / (1024 * 1024)).toFixed(2)} GiB`;

export const parseSandboxDiskCheckOutput = (stdout: string): SandboxDiskObservation | null => {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const dfLine = lines.find((line) => /^.+\s+\d+\s+\d+\s+\d+\s+\d+%\s+\/$/.test(line));
  const duLine = lines.find((line) => /^\d+\s+\/opt\/cargo-target$/.test(line));
  if (!dfLine || !duLine) return null;

  const dfMatch = dfLine.match(/^.+\s+(\d+)\s+\d+\s+(\d+)\s+\d+%\s+\/$/);
  const duMatch = duLine.match(/^(\d+)\s+\/opt\/cargo-target$/);
  if (!dfMatch || !duMatch) return null;

  const total_kb = parseSafeNonNegativeInteger(dfMatch[1]);
  const free_kb = parseSafeNonNegativeInteger(dfMatch[2]);
  const build_tree_kb = parseSafeNonNegativeInteger(duMatch[1]);
  if (
    total_kb === null ||
    free_kb === null ||
    build_tree_kb === null ||
    total_kb === 0 ||
    free_kb > total_kb
  ) {
    return null;
  }
  return { free_kb, total_kb, build_tree_kb };
};

export const reportSandboxDiskCheck = (
  ctx: SandboxDiskFactsContext,
  result: SandboxDiskCheckResult,
): SandboxDiskObservation | null => {
  if (result.exitCode !== 0) {
    const detail = result.stderr?.trim().slice(-300);
    ctx.diagnostic({
      code: "sandbox-space-check-failed",
      level: "warning",
      message:
        `sandbox 磁盘空间观测退化：检查命令退出码 ${result.exitCode ?? "unknown"}，未记录磁盘 facts` +
        (detail ? `；${detail}` : ""),
    });
    return null;
  }

  const observation = parseSandboxDiskCheckOutput(result.stdout);
  if (!observation) {
    ctx.diagnostic({
      code: "sandbox-space-check-failed",
      level: "warning",
      message: "sandbox 磁盘空间观测退化：检查输出格式无法解析，未记录磁盘 facts",
    });
    return null;
  }

  ctx.facts("sandbox.disk.free_kb", observation.free_kb);
  ctx.facts("sandbox.disk.total_kb", observation.total_kb);
  ctx.facts("sandbox.build_tree.kb", observation.build_tree_kb);

  if (observation.free_kb < SANDBOX_DISK_LOW_THRESHOLD_KB) {
    ctx.diagnostic({
      code: "sandbox-disk-space-low",
      level: "warning",
      message:
        `sandbox 磁盘空间偏低：剩余 ${formatDiskSizeGiB(observation.free_kb)} / ` +
        `总量 ${formatDiskSizeGiB(observation.total_kb)}，` +
        `/opt/cargo-target 构建树 ${formatDiskSizeGiB(observation.build_tree_kb)}，` +
        `低空间阈值 ${formatDiskSizeGiB(SANDBOX_DISK_LOW_THRESHOLD_KB)}`,
      data: {
        free_kb: observation.free_kb,
        total_kb: observation.total_kb,
        build_tree_kb: observation.build_tree_kb,
        threshold_kb: SANDBOX_DISK_LOW_THRESHOLD_KB,
      },
    });
  }
  return observation;
};

/** UTC 当天（YYYY-MM-DD）。Verifier 把 TZ 钉成 UTC，好让 CLI 跟我们对齐。 */
export const today = () => new Date().toISOString().slice(0, 10);

/** 把真实仓库在 BASE_COMMIT clone 到 workdir 根目录，并预热构建缓存。 */
export const prepareRepo: SandboxCommand = async (sandbox, ctx) => {
  ctx.progress({ message: "cloning toggl-cli @ base commit" });
  const cloned = await sandbox.runShell(
    [
      "set -euo pipefail",
      "rm -rf .git .niceeval-clone",
      `git clone -q -o origin ${REPO_URL} .niceeval-clone`,
      "mv .niceeval-clone/.git .git",
      "rm -rf .niceeval-clone",
      `git reset -q --hard ${BASE_COMMIT}`,
      "git remote remove origin",
      "git tag -l | xargs -r git tag -d >/dev/null",
      "git reflog expire --expire=now --all",
      "git gc -q --prune=now",
      `TS=$(git show -s --format=%ci ${BASE_COMMIT})`,
      'COUNT=$(git log --oneline --since="$TS" | wc -l)',
      '[ "$COUNT" -eq 1 ]',
    ].join("\n"),
  );
  if (cloned.exitCode !== 0) {
    throw new Error(`toggl-cli checkout failed: ${(cloned.stderr || cloned.stdout).trim().slice(-500)}`);
  }

  ctx.progress({ message: "warming cargo build cache (cold dependency build)" });
  const built = await sandbox.runShell(
    [
      "export RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo",
      'export PATH="/usr/local/cargo/bin:$PATH"',
      "cargo build --tests --quiet",
    ].join("\n"),
  );
  if (built.exitCode !== 0) {
    throw new Error(`baseline cargo build failed: ${(built.stderr || built.stdout).trim().slice(-800)}`);
  }

  try {
    const disk = await sandbox.runShell(SANDBOX_DISK_CHECK_COMMAND);
    reportSandboxDiskCheck(ctx, disk);
  } catch (error) {
    reportSandboxDiskCheck(ctx, {
      exitCode: null,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    });
  }
};
