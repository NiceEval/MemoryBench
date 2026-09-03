import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClaudeCodeConfig, CodexConfig, SkillSpec } from "niceeval/adapter";
import { changeFrequency, createCheckpoint, restoreCheckpoint, shell } from "niceeval/sandbox";
import type {
  SandboxAction,
  SandboxCleanupCommand,
  SandboxCommand,
} from "niceeval/sandbox";

const STATE_DIR = fileURLToPath(new URL("../../.cache/mempal/state/", import.meta.url));
const STATE_PATHS = [".mempal", ".mempal-notes"];
const COHORT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/** mempal crates.io 版本；SetupPrefix action identity 和结果 flags 共用这一处。 */
export const MEMPAL_VERSION = "0.9.0";

// 2026-08-30 起 active compare 不再使用下方历史注释所述的派生镜像：安装与模型预热
// 由 mempalPrepare() 的声明式 SetupPrefix action 在 NiceEval 官方基底上完成。

export const MEMPAL_SETUP_REVISION = "r6";
const MEMPAL_BIN = "/usr/local/bin/mempal";

/** 报告分组与状态 provenance 共用的实验事实。正式比较应显式设置 MEMPAL_COHORT。 */
export function mempalFlags(): Record<string, string> {
  const mempalCohort = process.env.MEMPAL_COHORT?.trim() || "local";
  if (!COHORT_PATTERN.test(mempalCohort) || mempalCohort === "." || mempalCohort === "..") {
    throw new Error(
      "MEMPAL_COHORT must be one path-safe segment: 1-64 letters, digits, dots, underscores, or hyphens.",
    );
  }
  return {
    memory: "mempal",
    mempalVersion: MEMPAL_VERSION,
    mempalCohort,
  };
}

/** 教 agent 用 mempal CLI 检索/落库的 Skill（Claude 与 Codex 共用）。 */
export const mempalSkill: SkillSpec = {
  kind: "local",
  path: "experiments/shared/mempal-skill",
  name: "mempal-memory",
};

function statePathFor(experimentId: string, evalGroupId: string): string {
  const cohortRoot = resolve(STATE_DIR, mempalFlags().mempalCohort);
  const statePath = resolve(cohortRoot, experimentId, `${evalGroupId}.tgz`);
  const insideCohort = relative(cohortRoot, statePath);
  if (
    insideCohort === "" ||
    insideCohort === ".." ||
    insideCohort.startsWith(`..${sep}`) ||
    isAbsolute(insideCohort)
  ) {
    throw new Error(`[mempal] experimentId escapes its cohort checkpoint directory: ${experimentId}`);
  }
  return statePath;
}

/**
 * 稳定工具层由 SetupPrefix cache 构建和复用，不再要求宿主预构建 memorybench-* 镜像。
 * 安装、模型预热与探针合成一个原子 action，避免发布半成品前缀。
 */
export function mempalPrepare(tool: "claude" | "codex"): SandboxAction {
  return shell({
    id: `memorybench.mempal.install.${tool}`,
    command: [
      "set -eux",
      'export PATH="/usr/local/bin:$HOME/.cargo/bin:$PATH"',
      'command -v cargo >/dev/null 2>&1 || { curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal; }',
      `${MEMPAL_BIN} --version 2>/dev/null | grep -F ${JSON.stringify(MEMPAL_VERSION)} >/dev/null || cargo install mempal --version ${JSON.stringify(MEMPAL_VERSION)} --locked --root /usr/local`,
      'warm_dir="$(mktemp -d)"; trap \'rm -rf "$warm_dir" "$HOME/.mempal"\' EXIT',
      "printf '%s\\n' 'niceeval mempal setup cache warmup' >\"$warm_dir/warmup.md\"",
      `${MEMPAL_BIN} init "$warm_dir"`,
      // The default model2vec embedder is bundled in mempal 0.9.0; a successful
      // ingest is the functional warmup and does not create an HF download cache.
      `${MEMPAL_BIN} ingest "$warm_dir" --wing memorybench-setup-cache`,
    ].join("\n"),
    user: "node",
    changeFrequency: changeFrequency.rare,
    cache: { fingerprint: `${MEMPAL_VERSION}-${MEMPAL_SETUP_REVISION}` },
  });
}

/** 每台 Group 的物理 Docker Sandbox 建成时恢复一次；同 Group 复用时 Attempt 间直接保留 `$HOME/.mempal`。 */
export const mempalLoadState: SandboxCommand = async (sandbox, ctx) => {
  if (ctx.evalGroup === undefined) {
    throw new Error("[mempal] Eval Group context is required to isolate parallel checkpoints.");
  }
  if (ctx.owner.kind !== "experiment") {
    throw new Error("[mempal] checkpoint command must be owned by an Experiment.");
  }
  const statePath = statePathFor(ctx.owner.id, ctx.evalGroup.id);
  let state: Buffer | undefined;
  try {
    state = readFileSync(statePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (state) {
    await restoreCheckpoint(sandbox, state);
  } else {
    await sandbox.runShellOrThrow(`${MEMPAL_BIN} init .`);
  }
  await sandbox.runShellOrThrow('mkdir -p "$HOME/.mempal-notes"');
  ctx.progress({
    message: `[mempal] checkpoint ${state ? "restored" : "empty"} (${state?.length ?? 0} bytes)`,
  });
};

/** 每台 Group 的物理 Docker Sandbox 退休时 best-effort 回存一次，不能反改已完成的题目 verdict。 */
export const mempalSaveState: SandboxCleanupCommand = async (sandbox, ctx) => {
  try {
    if (ctx.evalGroup === undefined) {
      throw new Error("[mempal] Eval Group context is required to isolate parallel checkpoints.");
    }
    if (ctx.owner.kind !== "experiment") {
      throw new Error("[mempal] checkpoint cleanup must be owned by an Experiment.");
    }
    const statePath = statePathFor(ctx.owner.id, ctx.evalGroup.id);
    const home = (await sandbox.runShellOrThrow('printf "%s" "$HOME"')).stdout.trim();
    await sandbox.runShellOrThrow(`test -d '${home}/.mempal'`);

    const data = await createCheckpoint(
      sandbox,
      STATE_PATHS.map((path) => `${home}/${path}`),
    );
    mkdirSync(dirname(statePath), { recursive: true });
    const tmp = `${statePath}.tmp`;
    writeFileSync(tmp, data);
    renameSync(tmp, statePath);
    const metadataPath = `${statePath}.meta.json`;
    const metadataTmp = `${metadataPath}.tmp`;
    writeFileSync(
      metadataTmp,
      `${JSON.stringify(
        {
          experimentId: ctx.owner.id,
          evalGroupId: ctx.evalGroup.id,
          cohort: mempalFlags().mempalCohort,
          mempalVersion: MEMPAL_VERSION,
          sha256: createHash("sha256").update(data).digest("hex"),
          bytes: data.length,
          savedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );
    renameSync(metadataTmp, metadataPath);
    ctx.progress({ message: `[mempal] checkpoint saved (${data.length} bytes)` });
  } catch (error) {
    ctx.diagnostic({
      code: "mempal-checkpoint-save-failed",
      level: "warning",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/** Mempal 的 Codex 扩展直接属于官方 Agent factory，而不是 Plugin。 */
export function mempalCodexConfig(skill: SkillSpec = mempalSkill): Pick<CodexConfig, "skills"> {
  return { skills: [skill] };
}

/** Mempal 的 Claude Code 扩展直接属于官方 Agent factory，而不是 Plugin。 */
export function mempalClaudeConfig(
  skill: SkillSpec = mempalSkill,
): Pick<ClaudeCodeConfig, "skills" | "settingsFile"> {
  return {
    skills: [skill],
    settingsFile: "configs/claude-code/mempal.json",
  };
}
