// MemoryBench 排行榜只负责业务分组与聚合；显示形状、双面渲染、格式化、覆盖率和主题配色
// 全部交给 niceeval 官方 Bars。

import {
  Bars,
  aggregate,
  defineComponent,
  passRate,
} from "niceeval/report";
import type {
  AggregationSubject,
  GroupFunction,
  Sample,
} from "niceeval/report";

const condition: GroupFunction = (subject) => {
  const experiment = subject.run.experiment;
  const line = (experiment?.labels?.line as string | undefined) ?? null;
  const memory = (experiment?.flags?.memory as string | undefined) ?? null;
  return displayName(subject.experimentId, line, memory);
};

const memory: GroupFunction = (subject: AggregationSubject) =>
  String(subject.run.experiment?.flags?.memory ?? "unknown");

export const Leaderboard = defineComponent<{ readonly input?: Sample }>(async (props, ctx) => {
  const rows = await aggregate(props.input ?? ctx.scope, {
    by: { condition, memory },
    values: { passRate },
  });

  return (
    <Bars
      points={rows}
      x="condition"
      y="passRate"
      color="memory"
      point="condition"
      sort={{ field: "passRate", direction: "desc" }}
      layout="horizontal"
    />
  );
});

Leaderboard.displayName = "Leaderboard";

/**
 * 人读短名:agent 线(labels.line)+ 非 baseline 记忆条件。
 * 例:codex、codex+mempal、codex+nowledge、bub。缺 line 时退回实验 id 末段,不把模型号塞进画面。
 */
function displayName(experimentId: string, line: string | null, memory: string | null): string {
  const base = line?.trim() || experimentId.split("/").pop() || experimentId;
  if (!memory || memory === "baseline") return base;
  return `${base}+${memory}`;
}
