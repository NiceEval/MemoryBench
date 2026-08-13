// 从 o11y 投影视图提取效率指标(wall time / tokens / cost),供报告计算与 attempt 页使用。
//
// 口径:
//   - wallMs = 顶层 timing interval(parentIntervalId === null)的 durationMs 之和;
//     没有顶层区间时退回「最后结束 − 最早开始」,避免父子区间重复计数。
//   - tokens = token-bucket 观测总和;输入/输出单列。
//   - costUsd = provider-cost 观测的 amount 之和(currency 字段当前统一按 USD 记账)。

import type { AttemptTimingView, UsageView } from "niceeval/report";

export interface AttemptMetrics {
  readonly wallMs: number | null;
  readonly tokens: number | null;
  readonly tokensInput: number | null;
  readonly tokensOutput: number | null;
  readonly costUsd: number | null;
}

export function attemptMetrics(
  timing: AttemptTimingView | null,
  usage: UsageView | null,
): AttemptMetrics {
  const wallMs = timing === null ? null : wallTimeMs(timing);
  let tokens: number | null = null;
  let tokensInput: number | null = null;
  let tokensOutput: number | null = null;
  let costUsd: number | null = null;
  if (usage !== null) {
    for (const observation of usage.observations) {
      if (observation.kind === "token-bucket") {
        tokens = (tokens ?? 0) + observation.tokens;
        if (observation.bucket === "input") tokensInput = (tokensInput ?? 0) + observation.tokens;
        else if (observation.bucket === "output") tokensOutput = (tokensOutput ?? 0) + observation.tokens;
      } else if (observation.kind === "provider-cost") {
        const amount = Number(observation.amount);
        if (Number.isFinite(amount)) costUsd = (costUsd ?? 0) + amount;
      }
    }
  }
  return { wallMs, tokens, tokensInput, tokensOutput, costUsd };
}

function wallTimeMs(timing: AttemptTimingView): number | null {
  const intervals = timing.intervals;
  if (intervals.length === 0) return null;
  const topLevel = intervals.filter((interval) => interval.parentIntervalId === null);
  if (topLevel.length > 0) return topLevel.reduce((sum, interval) => sum + interval.durationMs, 0);
  const starts = intervals.map((interval) => interval.startOffsetMs);
  const ends = intervals.map((interval) => interval.startOffsetMs + interval.durationMs);
  return Math.max(...ends) - Math.min(...starts);
}

/** 顶层阶段耗时,按总时长降序;用于 attempt 页的阶段表。 */
export function phaseDurations(
  timing: AttemptTimingView,
): readonly { readonly phase: string; readonly count: number; readonly durationMs: number }[] {
  const topLevel = timing.intervals.filter((interval) => interval.parentIntervalId === null);
  const groups = new Map<string, { count: number; durationMs: number }>();
  for (const interval of topLevel) {
    const group = groups.get(interval.phase) ?? { count: 0, durationMs: 0 };
    group.count += 1;
    group.durationMs += interval.durationMs;
    groups.set(interval.phase, group);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].durationMs - a[1].durationMs)
    .map(([phase, group]) => ({ phase, count: group.count, durationMs: group.durationMs }));
}

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatSeconds(ms: number): string {
  const seconds = ms / 1000;
  return seconds >= 60 ? `${(seconds / 60).toFixed(1)} min` : `${Math.round(seconds)} s`;
}

export function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
