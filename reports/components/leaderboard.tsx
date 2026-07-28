// 排行榜(矩阵条):左标签列 + 直角条 + 右数值。行名用人读短名(codex / codex+mempal / bub)。
// 内建 Chart 的散点/折线是「按系列分组比读数」,不是「整体排名条」,
// 所以按 docs-site/zh/tutorials/custom-reports.mdx 写成双面组件:
// web 面画 HTML 条,text 面用官方文本排版函数排字符,两面吃同一份算好的数据。
//
// 契约上照抄官方组件的三条:① 缺数据渲染 —、不画条、不补 0;② 排序方向随指标 better;
// ③ 颜色不硬编码 hex——挂 niceeval 自带的 nre-series-cN 类名,由内建 CSS 的 light-dark()
// 令牌上色,深浅色主题自动跟随。

import {
  Col,
  Style,
  bar,
  defineComponent,
  defineComposition,
  endToEndPassRate,
  padEnd,
  padStart,
  resolveLocalizedText,
  resolveMetricLabel,
  sources,
  stringWidth,
} from "niceeval/report";
import type { LocalizedText, MeasureCell } from "niceeval/report";

/** 记忆条件 → 调色板下标(nre-c0..c5)。颜色的含义由每行自带的 tag 说明,不需要额外图例。 */
const MEMORY_COLOR: Record<string, number> = {
  baseline: 0, // 蓝
  mempal: 1, // 绿
  nowledge: 5, // 橙
};

interface LeaderboardRow {
  /** 完整 experiment id:身份键,不用于显示。 */
  key: string;
  /** 显示名:agent 线 + 记忆条件,如 codex / codex+mempal / bub——不是实验文件名。 */
  label: string;
  /** [0,1];null = 该实验没有可用样本,不画条。 */
  ratio: number | null;
  display: LocalizedText;
  /** 调色板下标;null = 未知条件,走中性色。 */
  color: number | null;
  /** 测得该指标的 attempt 数。 */
  samples: number;
  /** 本行覆盖的 attempt 总数;samples < total 时出覆盖率角标,与官方格子同口径。 */
  total: number;
}

// 矩阵风:标签列在左、条在右、条身直角;卡片圆角与官方 Stat 网格(8px)对齐。
// 条填充用 color-mix 把系列色兑进 --panel:浅色主题兑淡、深色主题兑暗,条上字可读。
const CSS = `
.mb-lb { border:1px solid var(--line); border-radius:8px; padding:14px 16px; background:var(--panel); }
.mb-lb__head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:12px; }
.mb-lb__title { font-size:18px; font-weight:650; letter-spacing:-.01em; }
.mb-lb__metric { font-size:12px; color:var(--muted); white-space:nowrap; }
/* 行用 display:contents 并入父 grid,标签列宽取全局最长名——所有条的左缘对齐。 */
.mb-lb__rows { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:max-content 1fr max-content; column-gap:10px; row-gap:6px; align-items:center; }
.mb-lb__row { display:contents; }
.mb-lb__name { font-weight:600; white-space:nowrap; }
.mb-lb__track { position:relative; min-width:0; height:28px; border-radius:0; background:var(--panel-2); overflow:hidden; }
.mb-lb__name:hover + .mb-lb__track,
.mb-lb__track:hover { outline:1px solid var(--line-strong); outline-offset:0; }
.mb-lb__bar { position:absolute; inset:0 auto 0 0; border-radius:0;
  background:color-mix(in srgb, var(--nre-series) 70%, var(--panel)); }
.mb-lb__value { text-align:right; font-variant-numeric:tabular-nums; font-size:15px; font-weight:600; }
.mb-lb__value.mb-lb__missing { color:var(--soft); font-weight:400; }
.mb-lb__coverage { font-size:11px; font-weight:400; color:var(--muted); margin-left:2px; }
@media (max-width: 560px) {
  .mb-lb__rows { column-gap:8px; }
  .mb-lb__track { height:24px; }
  .mb-lb__value { font-size:13px; }
}
`;

function asMeasureCell(value: unknown): MeasureCell | undefined {
  if (typeof value === "object" && value !== null && "value" in value && "display" in value) {
    return value as MeasureCell;
  }
  return undefined;
}

/** 纯渲染面:只认算好的 props,零 IO、同步——这条边界让整棵树能被烘成静态页。 */
const LeaderboardBars = defineComponent<{
  title: LocalizedText;
  /** 数据层原样携带 metric.label(可本地化),由渲染面按 locale 解析——与官方组件同一条契约。 */
  metric: { key: string; label: LocalizedText };
  rows: LeaderboardRow[];
}>({
  dimensions: () => ({}),
  web({ title, metric, rows }, ctx) {
    const metricLabel = resolveMetricLabel(metric.label, ctx.locale, metric.key);
    return (
      <div className="nre mb-lb">
        <div className="mb-lb__head">
          <span className="mb-lb__title">{resolveLocalizedText(title, ctx.locale)}</span>
          <span className="mb-lb__metric">{metricLabel}</span>
        </div>
        <ol className="mb-lb__rows">
          {rows.map((row) => (
            <li key={row.key} className="mb-lb__row">
              <span className="mb-lb__name" title={row.key}>
                {row.label}
              </span>
              <div className="mb-lb__track">
                {row.ratio === null ? null : (
                  <div
                    className={`mb-lb__bar nre-series-c${row.color ?? "none"}`}
                    style={{ width: `${Math.max(2, Math.min(100, row.ratio * 100))}%` }}
                  />
                )}
              </div>
              <div
                className={`mb-lb__value${row.ratio === null ? " mb-lb__missing" : ""}`}
                title={
                  row.ratio === null
                    ? `no attempt measured this metric (${row.total} total)`
                    : `measured on ${row.samples} of ${row.total} attempts`
                }
              >
                {row.ratio === null ? "—" : resolveLocalizedText(row.display, ctx.locale)}
                {/* samples < total:有 attempt 测不了这个指标,角标如实标出,与官方格子同口径 */}
                {row.ratio !== null && row.samples < row.total && (
                  <sup className="mb-lb__coverage">
                    {row.samples}/{row.total}
                  </sup>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  },
  text({ title, metric, rows }, ctx) {
    const metricLabel = resolveMetricLabel(metric.label, ctx.locale, metric.key);
    // 两面同口径:覆盖率角标(15 个 attempt 里 12 个测得了这个指标)网页面是 sup,这里是后缀
    const valueOf = (row: LeaderboardRow) => {
      if (row.ratio === null) return "—";
      const value = resolveLocalizedText(row.display, ctx.locale);
      return row.samples < row.total ? `${value} ${row.samples}/${row.total}` : value;
    };
    // 列宽随内容和可用列宽算,不硬编码:一个汉字记 2 列(stringWidth)
    const nameWidth = Math.max(0, ...rows.map((row) => stringWidth(row.label)));
    const valueWidth = Math.max(stringWidth(metricLabel), ...rows.map((row) => stringWidth(valueOf(row))));
    const gaps = 4;
    const barWidth = Math.max(8, Math.min(24, ctx.width - nameWidth - valueWidth - gaps));
    const total = nameWidth + barWidth + valueWidth + gaps;

    const head = resolveLocalizedText(title, ctx.locale);
    const headPad = Math.max(1, total - stringWidth(head) - stringWidth(metricLabel));

    return [
      `${head}${" ".repeat(headPad)}${metricLabel}`,
      ...rows.map((row) => {
        const chart = row.ratio === null ? padEnd("—", barWidth) : bar(row.ratio, barWidth);
        const name = padEnd(row.label, nameWidth);
        return `${name}  ${chart}  ${padStart(valueOf(row), valueWidth)}`;
      }),
    ].join("\n");
  },
});

/**
 * 取数面:从当前 Sample 算通过率,按实验排名。
 * 显示名 = labels.line + 记忆条件(codex / codex+mempal / bub),完整 experiment id 只做身份键。
 */
export const Leaderboard = defineComposition<{ title?: LocalizedText }>(async (props, ctx) => {
  const dataset = await ctx.resolve(
    sources.measure.rows({
      dimensions: ["experiment"],
      measures: [endToEndPassRate],
      sort: endToEndPassRate,
    }),
  );
  const metricName = endToEndPassRate.name;
  // flags / labels 随 run 落盘,历史 run 也能按当时声明的条件显示与上色
  const metaOf = new Map<string, { line: string | null; memory: string | null }>();
  for (const run of ctx.input.runs) {
    if (metaOf.has(run.experimentId)) continue;
    const exp = run.experiment;
    metaOf.set(run.experimentId, {
      line: (exp?.labels?.line as string | undefined) ?? null,
      memory: (exp?.flags?.memory as string | undefined) ?? null,
    });
  }

  const rows: LeaderboardRow[] = dataset.rows.map((r) => {
    const cell = asMeasureCell(r.values[metricName])!;
    const meta = metaOf.get(r.key) ?? { line: null, memory: null };
    return {
      key: r.key,
      label: displayName(r.key, meta.line, meta.memory),
      ratio: cell.value,
      display: cell.display,
      color: meta.memory === null ? null : (MEMORY_COLOR[meta.memory] ?? null),
      samples: cell.samples,
      total: cell.total,
    };
  });

  return (
    <Col>
      <Style>{CSS}</Style>
      <LeaderboardBars
        title={props.title ?? { en: "Leaderboard", "zh-CN": "排行榜" }}
        metric={{
          key: endToEndPassRate.name,
          label: endToEndPassRate.label ?? { en: endToEndPassRate.name },
        }}
        rows={rows}
      />
    </Col>
  );
});

/**
 * 人读短名:agent 线(labels.line)+ 非 baseline 记忆条件。
 * 例:codex、codex+mempal、codex+nowledge、bub。缺 line 时退回实验 id 末段,不把模型号塞进画面。
 */
function displayName(experimentId: string, line: string | null, memory: string | null): string {
  const base = line?.trim() || experimentId.split("/").pop() || experimentId;
  if (!memory || memory === "baseline") return base;
  return `${base}+${memory}`;
}
