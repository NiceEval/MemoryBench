// MemoryBench 自定义报告 —— 当前 semantic report author API。
//
// 旧版报告是 legacy JSX bridge(defineComponent / Bars / ExperimentTable / Hero),
// 已退役。本文件用当前 API(RecordProjection + Calculation + Page + PageFamily +
// 语义 document)重建同一份用户价值:条件分组、排行榜/通过率、failure list、
// hero 说明与 attempt 下钻。数据只来自 niceeval/report 的官方 opaque projector。
//
// 旧 → 新语义映射:
//   - MemoryBenchHero          → overview 页「关于本报告」节(语义文档不支持外链,
//                                 GitHub 链接退化为内联 code 文本)
//   - Leaderboard(Bars)        → leaderboard 计算 + 条形图 + 排行榜表(条件/线/
//                                 记忆条件/通过/失败/错误/跳过/计分母/通过率)
//   - SampleSummary            → 顶部指标(总通过率 / attempt 数 / 条件数)
//   - ExperimentScatter        → efficiency 计算 + 条件 × 效率表(中位耗时/tokens/成本)
//   - ExperimentTable 下钻     → attempt PageFamily(verdict / 效率 / 阶段 / 断言 / 诊断)
//   - 条件分组口径不变         → display = line(+memory);旧版的 memory 配色由
//                                 「记忆条件」文本列承载(语义组件没有配色能力)
//   - head 埋点(GA4/vibeloft) → 新 Report 面不存在 head 通道,已删除
//   - 多语言文案               → 语义 document 无 locale 通道,页面文案单语言中文

import {
  attemptDiagnosticsProjector,
  attemptSlotProjection,
  attemptTimingProjector,
  attemptUsageProjector,
  assertionsProjector,
  defineCalculation,
  definePage,
  definePageFamily,
  defineReport,
  evaluationPlanProjector,
  reportCode,
  reportComponentId,
  reportDocument,
  reportId,
  reportInstanceKeyFromRecordId,
  reportInputs,
  reportLink,
  reportList,
  reportMetric,
  reportParagraph,
  reportRoute,
  reportRouteFromKeys,
  reportSection,
  reportStatus,
  reportTable,
  reportText,
  selectedRunProjection,
  verdictProjector,
  reportChart,
} from "niceeval/report";
import type {
  AnalysisSample,
  AssertionsSourceProjection,
  AttemptDiagnosticsView,
  EvaluationPlanView,
  ProjectedSample,
  ReportBlock,
  ReportInstanceKey,
  ReportProjectedValues,
  ReportRoute,
  Verdict,
} from "niceeval/report";
import { parseCondition, UNKNOWN_CONDITION } from "./components/conditions.ts";
import {
  attemptMetrics,
  formatNumber,
  formatRate,
  formatSeconds,
  phaseDurations,
} from "./components/metrics.ts";

const GITHUB_URL = "https://github.com/CorrectRoadH/memorybench";

// 本地 unwrap:report 构造器返回 Either,仓库未声明 effect 依赖,直接按结构判型。
type EitherBox<A> =
  | { readonly _tag: "Left"; readonly left: unknown }
  | { readonly _tag: "Right"; readonly right: A };

function unwrap<A>(box: EitherBox<A>, what: string): A {
  if (box._tag === "Right") return box.right;
  throw new Error(`invalid ${what}: ${JSON.stringify(box.left)}`);
}

// —— 官方 projector 声明(每类至多执行一次) ——
const verdicts = attemptSlotProjection(verdictProjector);
const evaluationPlan = selectedRunProjection(evaluationPlanProjector);
const timings = attemptSlotProjection(attemptTimingProjector);
const usages = attemptSlotProjection(attemptUsageProjector);
const assertions = attemptSlotProjection(assertionsProjector);
const diagnostics = attemptSlotProjection(attemptDiagnosticsProjector);

const data = reportInputs({ verdicts, evaluation_plan: evaluationPlan, timings, usages, assertions, diagnostics });

type DataInputs = ReportProjectedValues<typeof data>;

// —— 行模型:一条 included slot ——
interface AttemptSlotRow {
  readonly runId: string;
  readonly slotId: string;
  readonly attemptId: string;
  readonly experimentId: string | null;
  readonly evalId: string | null;
  readonly attemptOrdinal: number | null;
  readonly kind: "pass" | "score" | null;
  readonly condition: { readonly line: string; readonly memory: string; readonly display: string };
  readonly verdict: Verdict | null;
  readonly wallMs: number | null;
  readonly tokens: number | null;
  readonly tokensInput: number | null;
  readonly tokensOutput: number | null;
  readonly costUsd: number | null;
  readonly key: ReportInstanceKey;
  readonly route: ReportRoute;
}

type SlotEntryLike<Value> = Readonly<{
  readonly state: string;
  readonly slot: Readonly<{ readonly slotId: string }>;
  readonly attachment?: Readonly<{ readonly state: string; readonly value?: Value }>;
}>;

function slotEntryValue<Value>(entries: readonly SlotEntryLike<Value>[], slotId: string): Value | null {
  const entry = entries.find((e) => e.slot.slotId === slotId);
  if (!entry || entry.state !== "attachment-result" || !entry.attachment) return null;
  return entry.attachment.state === "available" ? (entry.attachment.value ?? null) : null;
}

function runPlan(sample: ProjectedSample<"selected-run", EvaluationPlanView>): EvaluationPlanView | null {
  for (const entry of sample.entries) {
    if (entry.attachment.state === "available") return entry.attachment.value;
  }
  return null;
}

function scanRows(sample: AnalysisSample, inputs: DataInputs): readonly AttemptSlotRow[] {
  const plan = runPlan(inputs.evaluation_plan);
  const rows: AttemptSlotRow[] = [];
  for (const slot of sample.slots) {
    if (slot.state !== "included") continue;
    const coordinate = plan?.coordinateForSlot(slot.slotId);
    const condition = coordinate ? parseCondition(coordinate.experimentId) : UNKNOWN_CONDITION;
    const metrics = attemptMetrics(
      slotEntryValue(inputs.timings.entries, slot.slotId),
      slotEntryValue(inputs.usages.entries, slot.slotId),
    );
    const runKey = reportInstanceKeyFromRecordId({ kind: "run", value: slot.runId });
    const slotKey = reportInstanceKeyFromRecordId({ kind: "slot", value: slot.slotId });
    rows.push({
      runId: slot.runId,
      slotId: slot.slotId,
      attemptId: slot.attempt.attemptId,
      experimentId: coordinate?.experimentId ?? null,
      evalId: coordinate?.evalId ?? null,
      attemptOrdinal: coordinate?.attempt ?? null,
      kind: coordinate?.kind ?? null,
      condition,
      verdict: slotEntryValue(inputs.verdicts.entries, slot.slotId),
      wallMs: metrics.wallMs,
      tokens: metrics.tokens,
      tokensInput: metrics.tokensInput,
      tokensOutput: metrics.tokensOutput,
      costUsd: metrics.costUsd,
      key: slotKey,
      route: unwrap(reportRouteFromKeys([runKey, slotKey]), `route for ${slot.slotId}`),
    });
  }
  return rows;
}

// —— 计算 1:slots(attempt 索引与 PageFamily 展开的数据源) ——
const slots = defineCalculation({
  id: unwrap(reportComponentId("slots"), "component id slots"),
  inputs: data,
  completeness: "allow-partial",
  calculate: ({ sample, inputs }) => scanRows(sample, inputs),
});

// —— 计算 2:leaderboard(条件分组通过率) ——
// 业务分母 = passed + failed + errored;skipped 单独计数、不进分母。
interface MutableLeaderboardRow {
  readonly condition: string;
  readonly line: string;
  readonly memory: string;
  passed: number;
  failed: number;
  errored: number;
  skipped: number;
  completed: number;
  rate: number | null;
}
interface LeaderboardRow {
  readonly condition: string;
  readonly line: string;
  readonly memory: string;
  readonly passed: number;
  readonly failed: number;
  readonly errored: number;
  readonly skipped: number;
  readonly completed: number;
  readonly rate: number | null;
}
interface LeaderboardValue {
  readonly rows: readonly LeaderboardRow[];
  readonly attemptCount: number;
  readonly passed: number;
  readonly completed: number;
  readonly rate: number | null;
}

const leaderboard = defineCalculation({
  id: unwrap(reportComponentId("leaderboard"), "component id leaderboard"),
  inputs: data,
  completeness: "allow-partial",
  calculate: ({ sample, inputs }): LeaderboardValue => {
    const rows = scanRows(sample, inputs);
    const groups = new Map<string, MutableLeaderboardRow>();
    for (const row of rows) {
      let group = groups.get(row.condition.display);
      if (!group) {
        group = {
          condition: row.condition.display,
          line: row.condition.line,
          memory: row.condition.memory,
          passed: 0,
          failed: 0,
          errored: 0,
          skipped: 0,
          completed: 0,
          rate: null,
        };
        groups.set(row.condition.display, group);
      }
      switch (row.verdict) {
        case "passed":
          group.passed += 1;
          group.completed += 1;
          break;
        case "failed":
          group.failed += 1;
          group.completed += 1;
          break;
        case "errored":
          group.errored += 1;
          group.completed += 1;
          break;
        case "skipped":
          group.skipped += 1;
          break;
      }
    }
    const list = [...groups.values()]
      .map((group) => ({ ...group, rate: group.completed > 0 ? group.passed / group.completed : null }))
      .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
    const passed = list.reduce((sum, group) => sum + group.passed, 0);
    const completed = list.reduce((sum, group) => sum + group.completed, 0);
    return {
      rows: list,
      attemptCount: rows.length,
      passed,
      completed,
      rate: completed > 0 ? passed / completed : null,
    };
  },
});

// —— 计算 3:failures(failed / errored 明细,带 attempt 路由) ——
interface FailureRow {
  readonly condition: string;
  readonly line: string;
  readonly memory: string;
  readonly evalId: string;
  readonly attemptOrdinal: number | null;
  readonly verdict: "failed" | "errored";
  readonly route: ReportRoute;
}

const failures = defineCalculation({
  id: unwrap(reportComponentId("failures"), "component id failures"),
  inputs: data,
  completeness: "allow-partial",
  calculate: ({ sample, inputs }): readonly FailureRow[] =>
    scanRows(sample, inputs)
      .filter((row): row is AttemptSlotRow & { verdict: "failed" | "errored" } =>
        row.verdict === "failed" || row.verdict === "errored",
      )
      .map((row) => ({
        condition: row.condition.display,
        line: row.condition.line,
        memory: row.condition.memory,
        evalId: row.evalId ?? "?",
        attemptOrdinal: row.attemptOrdinal,
        verdict: row.verdict,
        route: row.route,
      })),
});

// —— 计算 4:efficiency(条件 × 中位耗时 / tokens / 成本) ——
interface ConditionEfficiency {
  readonly condition: string;
  readonly line: string;
  readonly memory: string;
  readonly timingCount: number;
  readonly medianWallMs: number | null;
  readonly totalTokens: number | null;
  readonly costUsd: number | null;
}

const efficiency = defineCalculation({
  id: unwrap(reportComponentId("efficiency"), "component id efficiency"),
  inputs: data,
  completeness: "allow-partial",
  calculate: ({ sample, inputs }): { readonly rows: readonly ConditionEfficiency[] } => {
    const rows = scanRows(sample, inputs);
    const groups = new Map<
      string,
      {
        readonly condition: string;
        readonly line: string;
        readonly memory: string;
        walls: number[];
        tokens: number[];
        costs: number[];
      }
    >();
    for (const row of rows) {
      let group = groups.get(row.condition.display);
      if (!group) {
        group = {
          condition: row.condition.display,
          line: row.condition.line,
          memory: row.condition.memory,
          walls: [],
          tokens: [],
          costs: [],
        };
        groups.set(row.condition.display, group);
      }
      if (row.wallMs !== null) group.walls.push(row.wallMs);
      if (row.tokens !== null) group.tokens.push(row.tokens);
      if (row.costUsd !== null) group.costs.push(row.costUsd);
    }
    const list = [...groups.values()].map((group) => ({
      condition: group.condition,
      line: group.line,
      memory: group.memory,
      timingCount: group.walls.length,
      medianWallMs: median(group.walls),
      totalTokens: group.tokens.length > 0 ? group.tokens.reduce((sum, v) => sum + v, 0) : null,
      costUsd: group.costs.length > 0 ? group.costs.reduce((sum, v) => sum + v, 0) : null,
    }));
    return { rows: list };
  },
});

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function verdictTone(verdict: Verdict | null): "neutral" | "positive" | "warning" | "negative" {
  switch (verdict) {
    case "passed":
      return "positive";
    case "failed":
    case "errored":
      return "negative";
    default:
      return "neutral";
  }
}

// —— 页面 1:overview ——
const overviewPage = definePage({
  id: unwrap(reportComponentId("overview"), "component id overview"),
  route: unwrap(reportRoute("/"), "route /"),
  calculations: { slots, leaderboard, failures, efficiency },
  render: ({ calculations }) => {
    const children: ReportBlock[] = [
      reportSection({
        heading: "关于本报告",
        children: [
          reportParagraph([
            reportText(
              "MemoryBench 评测 coding agent 的记忆能力:同一批真实开发任务、同一个模型,只切换 memory 条件(baseline / mempal / nowledge / obelisk / remem),比较任务完成率与开发效率。",
            ),
          ]),
          reportParagraph([reportText("任务集与报告源码: "), reportCode(GITHUB_URL)]),
        ],
      }),
    ];

    if (calculations.leaderboard.state === "available") {
      const lb = calculations.leaderboard.value;
      children.push(
        reportSection({
          heading: "总体",
          children: [
            reportMetric({ label: "总通过率", value: lb.rate === null ? "—" : formatRate(lb.rate) }),
            reportMetric({ label: "attempt 数", value: lb.attemptCount }),
            reportMetric({ label: "条件数", value: lb.rows.length }),
          ],
        }),
      );
      const chartBlocks: ReportBlock[] =
        lb.rows.length > 0
          ? [
              reportChart({
                chart: "bar",
                title: "各条件通过率",
                categoryLabel: "条件",
                categories: lb.rows.map((row) => row.condition),
                series: [
                  {
                    label: "通过率 (%)",
                    values: lb.rows.map((row) => (row.rate === null ? null : Math.round(row.rate * 1000) / 10)),
                  },
                ],
              }),
            ]
          : [];
      const tableBlocks: ReportBlock[] =
        lb.rows.length > 0
          ? [
              reportTable({
                caption: "条件 × 通过率",
                columns: [
                  { key: "condition", label: "条件" },
                  { key: "line", label: "agent 线" },
                  { key: "memory", label: "记忆条件" },
                  { key: "passed", label: "通过" },
                  { key: "failed", label: "失败" },
                  { key: "errored", label: "错误" },
                  { key: "skipped", label: "跳过" },
                  { key: "total", label: "计分母" },
                  { key: "rate", label: "通过率" },
                ],
                rows: lb.rows.map((row) => ({
                  condition: row.condition,
                  line: row.line,
                  memory: row.memory,
                  passed: row.passed,
                  failed: row.failed,
                  errored: row.errored,
                  skipped: row.skipped,
                  total: row.completed,
                  rate: row.rate === null ? "—" : formatRate(row.rate),
                })),
              }),
            ]
          : [reportStatus({ tone: "neutral", label: "没有可计数的 attempt" })];
      children.push(
        reportSection({
          heading: "条件排行榜",
          children: [...chartBlocks, ...tableBlocks],
        }),
      );
    }

    if (calculations.efficiency.state === "available") {
      const rows = calculations.efficiency.value.rows;
      children.push(
        reportSection({
          heading: "开发效率(按条件)",
          children:
            rows.length > 0
              ? [
                  reportTable({
                    caption: "条件 × 效率",
                    columns: [
                      { key: "condition", label: "条件" },
                      { key: "timingCount", label: "计时 attempt" },
                      { key: "median", label: "中位耗时" },
                      { key: "tokens", label: "tokens 合计" },
                      { key: "cost", label: "成本 (USD)" },
                    ],
                    rows: rows.map((row) => ({
                      condition: row.condition,
                      timingCount: row.timingCount,
                      median: row.medianWallMs === null ? "—" : formatSeconds(row.medianWallMs),
                      tokens: row.totalTokens === null ? "—" : formatNumber(row.totalTokens),
                      cost: row.costUsd === null ? "—" : `$${row.costUsd.toFixed(2)}`,
                    })),
                  }),
                ]
              : [reportStatus({ tone: "neutral", label: "没有效率数据" })],
        }),
      );
    }

    if (calculations.failures.state === "available") {
      const fails = calculations.failures.value;
      children.push(
        reportSection({
          heading: "失败与错误",
          children:
            fails.length === 0
              ? [reportStatus({ tone: "positive", label: "本次样本没有失败 attempt" })]
              : [
                  reportList({
                    ordered: false,
                    items: fails.map((failure) => [
                      reportStatus({
                        tone: failure.verdict === "failed" ? "negative" : "warning",
                        label: failure.verdict,
                      }),
                      reportParagraph([
                        reportText(`${failure.condition} · ${failure.evalId} · attempt ${failure.attemptOrdinal ?? "?"} `),
                        reportLink({
                          label: [reportText("详情")],
                          target: { kind: "route", route: failure.route },
                        }),
                      ]),
                    ]),
                  }),
                ],
        }),
      );
    }

    if (calculations.slots.state === "available") {
      const rows = calculations.slots.value;
      children.push(
        reportSection({
          heading: "Attempt 下钻",
          children:
            rows.length > 0
              ? [
                  reportList({
                    ordered: false,
                    items: rows.map((row) => [
                      reportParagraph([
                        reportLink({
                          label: [
                            reportText(
                              `${row.condition.display} · ${row.evalId ?? "?"} · attempt ${row.attemptOrdinal ?? "?"}`,
                            ),
                          ],
                          target: { kind: "route", route: row.route },
                        }),
                      ]),
                    ]),
                  }),
                ]
              : [reportStatus({ tone: "neutral", label: "没有 attempt" })],
        }),
      );
    }

    return reportDocument({ title: "MemoryBench", children });
  },
});

// —— 页面族:attempt 下钻 ——
function assertionBlocks(view: AssertionsSourceProjection): ReportBlock[] {
  const rows = view.entries.map((entry) => {
    const display = entry.entry.display;
    const label =
      display.label ?? (display.groupPath.length > 0 ? display.groupPath.join(" / ") : entry.entry.entryId);
    const result = entry.entry.result;
    const outcome =
      result.state === "matched"
        ? "通过"
        : result.state === "mismatched"
          ? "未通过"
          : result.state === "errored"
            ? "评估错误"
            : result.state === "unavailable"
              ? "数据不可用"
              : "不适用";
    return { label, gate: result.gate, outcome };
  });
  if (rows.length === 0) return [reportStatus({ tone: "neutral", label: "没有断言记录" })];
  return [
    reportTable({
      caption: "断言",
      columns: [
        { key: "label", label: "断言" },
        { key: "gate", label: "gate" },
        { key: "outcome", label: "结果" },
      ],
      rows,
    }),
  ];
}

function diagnosticBlocks(view: AttemptDiagnosticsView): ReportBlock[] {
  return view.diagnostics.map((diagnostic) =>
    reportStatus({
      tone: diagnostic.kind === "execution-error" ? "negative" : "warning",
      label: `${diagnostic.phase} · ${diagnostic.code}`,
      detail: [reportText(diagnostic.summary)],
    }),
  );
}

const attemptFamily = definePageFamily({
  id: unwrap(reportComponentId("attempt"), "component id attempt"),
  inputs: data,
  completeness: "allow-partial",
  calculations: { slots },
  instances: ({ calculations }) =>
    calculations.slots.state === "available" ? calculations.slots.value : [],
  key: (instance) => instance.key,
  route: (instance) => instance.route,
  render: ({ instance, inputs }) => {
    const slotId = instance.slotId;
    const verdict = slotEntryValue(inputs.verdicts.entries, slotId);
    const timing = slotEntryValue(inputs.timings.entries, slotId);
    const usage = slotEntryValue(inputs.usages.entries, slotId);
    const assertionView = slotEntryValue(inputs.assertions.entries, slotId);
    const diagnosticView = slotEntryValue(inputs.diagnostics.entries, slotId);
    const metrics = attemptMetrics(timing, usage);

    const children: ReportBlock[] = [
      reportParagraph([
        reportText(
          `${instance.condition.display} · ${instance.evalId ?? "?"} · attempt ${instance.attemptOrdinal ?? "?"}`,
        ),
        reportText(" · run "),
        reportCode(instance.runId),
        reportText(" · attempt "),
        reportCode(instance.attemptId),
      ]),
      reportStatus({ tone: verdictTone(verdict), label: verdict ?? "no verdict recorded" }),
      reportSection({
        heading: "效率",
        children: [
          reportMetric({ label: "耗时", value: metrics.wallMs === null ? "—" : formatSeconds(metrics.wallMs) }),
          reportMetric({ label: "tokens 合计", value: metrics.tokens === null ? "—" : formatNumber(metrics.tokens) }),
          reportMetric({
            label: "tokens 输入/输出",
            value:
              metrics.tokensInput === null && metrics.tokensOutput === null
                ? "—"
                : `${formatNumber(metrics.tokensInput ?? 0)} / ${formatNumber(metrics.tokensOutput ?? 0)}`,
          }),
          reportMetric({
            label: "成本 (USD)",
            value: metrics.costUsd === null ? "—" : `$${metrics.costUsd.toFixed(4)}`,
          }),
        ],
      }),
    ];

    if (timing) {
      const phases = phaseDurations(timing);
      children.push(
        reportSection({
          heading: "阶段耗时",
          children:
            phases.length > 0
              ? [
                  reportTable({
                    caption: "顶层阶段",
                    columns: [
                      { key: "phase", label: "阶段" },
                      { key: "count", label: "次数" },
                      { key: "duration", label: "耗时" },
                    ],
                    rows: phases.map((phase) => ({
                      phase: phase.phase,
                      count: phase.count,
                      duration: formatSeconds(phase.durationMs),
                    })),
                  }),
                ]
              : [reportStatus({ tone: "neutral", label: "没有阶段数据" })],
        }),
      );
    }

    if (assertionView) {
      children.push(reportSection({ heading: "断言", children: assertionBlocks(assertionView) }));
    }

    if (diagnosticView && diagnosticView.diagnostics.length > 0) {
      children.push(reportSection({ heading: "诊断", children: diagnosticBlocks(diagnosticView) }));
    }

    return reportDocument({
      title: `${instance.condition.display} · ${instance.evalId ?? ""} · attempt ${instance.attemptOrdinal ?? ""}`,
      children,
    });
  },
});

export default defineReport({
  id: unwrap(reportId("memorybench"), "report id"),
  calculations: { slots, leaderboard, failures, efficiency },
  pages: [overviewPage, attemptFamily],
});
