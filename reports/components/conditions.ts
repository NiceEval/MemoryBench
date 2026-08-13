// MemoryBench 报告的条件分组。
//
// 旧报告 API 能投影 experiment config(labels.line / flags.memory);当前 semantic
// report API 只投影运行事实,作者拿不到 experiment config。MemoryBench 的 compare
// 实验约定把条件编码进 experimentId 末段,解析规则:
//   compare/codex-gpt-5.6-luna          → line=codex,   memory=baseline
//   compare/codex-gpt-5.6-luna--mempal  → line=codex,   memory=mempal
//   compare/bub-gpt-5.6-luna            → line=bub,     memory=baseline
//   compare/claude-dp-v4--nowledge      → line=claude,  memory=nowledge
// `--` 前的第一段(line)取首个 `-` 分段,与 experiments/ 里 labels.line 的短名
// (codex / bub / claude)一致;`--` 后的后缀是记忆条件。解析不出时退回 unknown,
// 不猜测。

export interface MemoryCondition {
  /** agent 线短名:codex / bub / claude。 */
  readonly line: string;
  /** 记忆条件:baseline / mempal / nowledge / obelisk / remem / …。 */
  readonly memory: string;
  /** 展示名:baseline 时是 line,否则 line+memory(与旧报告口径一致)。 */
  readonly display: string;
}

export const UNKNOWN_CONDITION: MemoryCondition = {
  line: "unknown",
  memory: "unknown",
  display: "unknown",
};

export function parseCondition(experimentId: string): MemoryCondition {
  const last = experimentId.split("/").pop();
  if (!last) return UNKNOWN_CONDITION;
  const [base, ...suffixes] = last.split("--");
  if (!base) return UNKNOWN_CONDITION;
  const memory = suffixes.length > 0 ? suffixes.join("--") : "baseline";
  const line = base.split("-")[0] || base;
  const display = memory === "baseline" ? line : `${line}+${memory}`;
  return { line, memory, display };
}
