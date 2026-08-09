import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillSpec } from "niceeval/adapter";
import { createCheckpoint, restoreCheckpoint, shell } from "niceeval/sandbox";
import type {
  SandboxCommand,
  SandboxHook,
} from "niceeval/sandbox";
import {
  NICEEVAL_CLAUDE_CODE_E2B_TEMPLATE,
  NICEEVAL_CODEX_E2B_TEMPLATE,
} from "niceeval/sandbox/e2b-template";

const STATE_DIR = fileURLToPath(new URL("../../.cache/mempal/state/", import.meta.url));
const STATE_PATHS = [".mempal", ".mempal-notes"];
const COHORT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const CHECKPOINT_BYTES_FACT = "mempal.checkpoint_bytes";

/** mempal crates.io 版本；构建模板、模板身份和结果 flags 共用这一处。 */
export const MEMPAL_VERSION = "0.9.0";

/** 每个派生模板只依赖实际使用的完整 base ref，不另存 NiceEval release 锁。 */
export function mempalBaseTemplate(tool: "claude" | "codex"): string {
  return tool === "claude" ? NICEEVAL_CLAUDE_CODE_E2B_TEMPLATE : NICEEVAL_CODEX_E2B_TEMPLATE;
}

/** base ref 或 mempal 版本任一变化，派生模板名都会自然变化，避免复用旧构建。 */
export function mempalTemplate(tool: "claude" | "codex"): string {
  const base = createHash("sha256").update(mempalBaseTemplate(tool)).digest("hex").slice(0, 12);
  const mempal = MEMPAL_VERSION.replace(/[^a-z0-9]+/gi, "-");
  // E2B 静默把模板名小写化（服务端存的就是 memorybench-...），源码里跟着写小写以免依赖未文档化的大小写不敏感匹配。
  return `memorybench-${tool}-mempal-${base}-${mempal}`;
}

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

/** 每条 Attempt 重放的薄 prepare：只验证不可变模板里的二进制与 embedding cache。 */
export function mempalPrepare(tool: "claude" | "codex"): SandboxCommand {
  const missingTemplate =
    `[mempal] template does not contain mempal. Build ${mempalTemplate(tool)} with ` +
    `pnpm template:mempal ${tool}, then use that template.`;
  return shell([
    "set -eu",
    `command -v mempal >/dev/null 2>&1 || { printf '%s\\n' ${JSON.stringify(missingTemplate)} >&2; exit 1; }`,
    'test -n "$(find "$HOME/.cache/huggingface" -name "*.safetensors" -print -quit 2>/dev/null)" || { printf \'%s\\n\' \'[mempal] embedding cache probe failed\' >&2; exit 1; }',
  ].join("\n"));
}

/** 每台物理 Sandbox 建成时恢复一次；reuse 时 Attempt 间直接保留 `$HOME/.mempal`。 */
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

/** 每台物理 Sandbox 退休时 best-effort 回存一次，不能反改已完成的题目 verdict。 */
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
