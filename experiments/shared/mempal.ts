import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillSpec } from "niceeval/adapter";
import { createCheckpoint, restoreCheckpoint } from "niceeval/sandbox";
import type {
  SandboxCommand,
  SandboxCommandContext,
  SandboxCommandTarget,
  SandboxHook,
} from "niceeval/sandbox";
import {
  NICEEVAL_CLAUDE_CODE_E2B_TEMPLATE,
  NICEEVAL_CODEX_E2B_TEMPLATE,
} from "niceeval/sandbox/e2b-template";

const STATE_DIR = fileURLToPath(new URL("../../.cache/mempal/state/", import.meta.url));
const STATE_PATHS = [".mempal", ".mempal-notes"];

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
  return {
    memory: "mempal",
    mempalVersion: MEMPAL_VERSION,
    mempalCohort: process.env.MEMPAL_COHORT?.trim() || "local",
  };
}

/** 教 agent 用 mempal CLI 检索/落库的 Skill（Claude 与 Codex 共用）。 */
export const mempalSkill: SkillSpec = {
  kind: "local",
  path: "experiments/shared/mempal-skill",
  name: "mempal-memory",
};

function statePathFor(experimentId: string): string {
  return join(STATE_DIR, mempalFlags().mempalCohort, `${experimentId}.tgz`);
}

function commandFailure(label: string, result: { exitCode: number; stdout: string; stderr: string }): Error {
  const tail = (result.stderr || result.stdout).trim().slice(-500) || "no output";
  return new Error(`[mempal] ${label} failed (exit ${result.exitCode}): ${tail}`);
}

async function requireCommand(sb: SandboxCommandTarget, label: string, script: string): Promise<void> {
  const result = await sb.runShell(script);
  if (result.exitCode !== 0) throw commandFailure(label, result);
}

function commandLog(ctx: SandboxCommandContext, message: string): void {
  ctx.progress({ message });
}

/** 每条 Attempt 重放的薄 prepare：只验证不可变模板里的二进制与 embedding cache。 */
export function mempalPrepare(tool: "claude" | "codex"): SandboxCommand {
  return async (sb, ctx) => {
    const probe = await sb.runShell("command -v mempal");
    if (probe.exitCode !== 0) {
      throw new Error(
        `[mempal] template does not contain mempal. Build ${mempalTemplate(tool)} with ` +
          `\`pnpm template:mempal ${tool}\`, then use that template.`,
      );
    }
    await requireCommand(
      sb,
      "embedding cache probe",
      'test -n "$(find "$HOME/.cache/huggingface" -name "*.safetensors" -print -quit 2>/dev/null)"',
    );
    commandLog(ctx, "[mempal] template probe passed: binary and embedding cache");
  };
}

/** 每台物理 Sandbox 建成时恢复一次；reuse 时 Attempt 间直接保留 `$HOME/.mempal`。 */
export const mempalLoadState: SandboxHook = async (sandbox, ctx) => {
  const statePath = statePathFor(ctx.experimentId);
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
  ctx.fact("mempal.checkpointBytes", state?.length ?? 0);
};

/** 每台物理 Sandbox 退休时 best-effort 回存一次，不能反改已完成的题目 verdict。 */
export const mempalSaveState: SandboxHook = async (sandbox, ctx) => {
  try {
    const statePath = statePathFor(ctx.experimentId);
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
    writeFileSync(
      `${statePath}.meta.json`,
      `${JSON.stringify(
        {
          experimentId: ctx.experimentId,
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
    ctx.fact("mempal.checkpointBytes", data.length);
  } catch (error) {
    ctx.diagnostic({
      code: "mempal-checkpoint-save-failed",
      level: "warning",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
