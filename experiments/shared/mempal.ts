import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClaudeCodeConfig, CodexConfig, SkillSpec } from "niceeval/adapter";
import { createCheckpoint, restoreCheckpoint, shell } from "niceeval/sandbox";
import type {
  SandboxCommand,
  SandboxHook,
} from "niceeval/sandbox";
import {
  NICEEVAL_CLAUDE_CODE_DOCKER_IMAGE,
  NICEEVAL_CODEX_DOCKER_IMAGE,
} from "niceeval/sandbox";

const STATE_DIR = fileURLToPath(new URL("../../.cache/mempal/state/", import.meta.url));
const STATE_PATHS = [".mempal", ".mempal-notes"];
const COHORT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const CHECKPOINT_BYTES_FACT = "mempal.checkpoint_bytes";

/** mempal crates.io 版本；构建镜像、镜像身份和结果 flags 共用这一处。 */
export const MEMPAL_VERSION = "0.9.0";

/** Docker 配方修订；变更稳定依赖或构建步骤时必须递增，避免覆盖旧镜像。 */
export const MEMPAL_DOCKERFILE_REVISION = "r1";

/** 每个派生镜像都从 NiceEval 公开、版本钉死的对应 Agent 基底继续构建。 */
export function mempalBaseImage(tool: "claude" | "codex"): string {
  return tool === "claude" ? NICEEVAL_CLAUDE_CODE_DOCKER_IMAGE : NICEEVAL_CODEX_DOCKER_IMAGE;
}

/** 基底镜像、mempal 版本或 Docker 配方任一变化，都会得到一个新的不可变本地镜像 tag。 */
export function mempalDockerImage(tool: "claude" | "codex"): string {
  const base = createHash("sha256").update(mempalBaseImage(tool)).digest("hex").slice(0, 12);
  const mempal = MEMPAL_VERSION.replace(/[^a-z0-9]+/gi, "-");
  return `memorybench-${tool}-mempal:${base}-${mempal}-${MEMPAL_DOCKERFILE_REVISION}`;
}

export const MEMPAL_CLAUDE_DOCKER_IMAGE = mempalDockerImage("claude");
export const MEMPAL_CODEX_DOCKER_IMAGE = mempalDockerImage("codex");

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

/** 每条 Attempt 重放的薄 prepare：只验证不可变 Docker 镜像里的二进制与 embedding cache。 */
export function mempalPrepare(tool: "claude" | "codex"): SandboxCommand {
  const image = mempalDockerImage(tool);
  const missingImage =
    `[mempal] Docker image does not contain mempal. Build ${image} with ` +
    `pnpm docker:mempal ${tool}, then use that image.`;
  return shell([
    "set -eu",
    `command -v mempal >/dev/null 2>&1 || { printf '%s\\n' ${JSON.stringify(missingImage)} >&2; exit 1; }`,
    'test -n "$(find "$HOME/.cache/huggingface" -name "*.safetensors" -print -quit 2>/dev/null)" || { printf \'%s\\n\' \'[mempal] embedding cache probe failed\' >&2; exit 1; }',
  ].join("\n"));
}

/** 每台 Group 的物理 Docker Sandbox 建成时恢复一次；同 Group 复用时 Attempt 间直接保留 `$HOME/.mempal`。 */
export const mempalLoadState: SandboxHook = async (sandbox, ctx) => {
  if (ctx.evalGroup === undefined) {
    throw new Error("[mempal] Eval Group context is required to isolate parallel checkpoints.");
  }
  const statePath = statePathFor(ctx.experimentId, ctx.evalGroup.id);
  let state: Buffer | undefined;
  try {
    state = readFileSync(statePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (state) {
    await restoreCheckpoint(sandbox, state);
  } else {
    await sandbox.runShellOrThrow("mempal init .");
  }
  await sandbox.runShellOrThrow('mkdir -p "$HOME/.mempal-notes"');
  ctx.fact("mempal.state", state ? "restored" : "empty");
  ctx.fact(CHECKPOINT_BYTES_FACT, state?.length ?? 0);
};

/** 每台 Group 的物理 Docker Sandbox 退休时 best-effort 回存一次，不能反改已完成的题目 verdict。 */
export const mempalSaveState: SandboxHook = async (sandbox, ctx) => {
  try {
    if (ctx.evalGroup === undefined) {
      throw new Error("[mempal] Eval Group context is required to isolate parallel checkpoints.");
    }
    const statePath = statePathFor(ctx.experimentId, ctx.evalGroup.id);
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
          experimentId: ctx.experimentId,
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
    ctx.fact(CHECKPOINT_BYTES_FACT, data.length);
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
