// 排行榜(横向排名条):一行一个实验，条长 = 通过率，右侧是数值，条上的小标签是记忆条件。
// niceeval 没有这个形态的内建组件（MetricBars 的网页面是竖向分组柱，比的是「每组里谁高」，
// 不是「整体排名」），所以按 docs-site/zh/tutorials/custom-reports.mdx「换形态」一节
// 写成双面组件：web 面画 HTML 条，text 面用官方文本排版函数排字符，两面吃同一份算好的数据。
//
// 契约上照抄官方组件的三条：① 缺数据渲染 —、不画条、不补 0;② 排序方向随指标 better;
// ③ 颜色不硬编码 hex——挂 niceeval 自带的 nre-series-cN 类名，由内建 CSS 的 light-dark()
// 令牌上色，深浅色主题自动跟随（见 niceeval src/report/assets/styles.css「系列上色」）。

import {
  Col,
  Style,
  bar,
  defineComponent,
  endToEndPassRate,
  metricTableData,
  padEnd,
  padStart,
  resolveLocalizedText,
  resolveMetricLabel,
  stringWidth,
} from "niceeval/report";
import type { LocalizedText } from "niceeval/report";

/** 记忆条件 → 调色板下标(nre-c0..c5)。颜色的含义由每行自带的 tag 说明，不需要额外图例。 */
const MEMORY_COLOR: Record<string, number> = {
  baseline: 0, // 蓝
  mempal: 1, // 绿
  nowledge: 5, // 橙
};

interface LeaderboardRow {
  /** 完整 experiment id：身份键，不用于显示。 */
  key: string;
  /** 显示名：同组 id 去掉公共目录前缀。 */
  label: string;
  /** 条上的小标签：本仓库的自变量 = 记忆条件。 */
  tag: string | null;
  /** [0,1];null = 该实验没有可用样本，不画条。 */
  ratio: number | null;
  display: LocalizedText;
  /** 调色板下标；null = 未知条件，走中性色。 */
  color: number | null;
}

const CSS = `
.mb-lb { border:1px solid var(--line); border-radius:12px; padding:14px 16px; background:var(--panel); }
.mb-lb__head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:10px; }
.mb-lb__title { font-size:18px; font-weight:650; letter-spacing:-.01em; }
.mb-lb__metric { font-size:12px; color:var(--muted); }
.mb-lb__rows { list-style:none; margin:0; padding:0; }
.mb-lb__row { display:flex; align-items:center; gap:12px; padding:3px 0; }
.mb-lb__track { position:relative; flex:1 1 auto; min-width:0; height:36px; border-radius:8px; background:var(--panel-2); overflow:hidden; }
.mb-lb__bar { position:absolute; inset:0 auto 0 0; border-radius:8px; border-left:3px solid var(--nre-series);
  background:color-mix(in srgb, var(--nre-series) 26%, transparent); }
.mb-lb__label { position:absolute; inset:0; display:flex; align-items:center; gap:8px; padding:0 12px; min-width:0; }
.mb-lb__name { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mb-lb__tag { font-size:12px; color:var(--muted); white-space:nowrap; }
.mb-lb__value { flex:0 0 auto; width:4.5em; text-align:right; font-variant-numeric:tabular-nums; font-size:16px; font-weight:600; }
.mb-lb__value.mb-lb__missing { color:var(--soft); font-weight:400; }
`;

/** 纯渲染面：只认算好的 props，零 IO、同步——这条边界让整棵树能被烘成静态页。 */
const LeaderboardBars = defineComponent<{
  title: LocalizedText;
  /** 数据层原样携带 metric.label(可本地化),由渲染面按 locale 解析——与官方组件同一条契约。 */
  metric: { key: string; label: LocalizedText };
  rows: LeaderboardRow[];
}>({
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
              <div className="mb-lb__track">
                {row.ratio === null ? null : (
                  <div
                    className={`mb-lb__bar nre-series-c${row.color ?? "none"}`}
                    style={{ width: `${Math.max(2, Math.min(100, row.ratio * 100))}%` }}
                  />
                )}
                <div className="mb-lb__label">
                  <span className="mb-lb__name">{row.label}</span>
                  {row.tag === null ? null : <span className="mb-lb__tag">{row.tag}</span>}
                </div>
              </div>
              <div className={`mb-lb__value${row.ratio === null ? " mb-lb__missing" : ""}`}>
                {row.ratio === null ? "—" : resolveLocalizedText(row.display, ctx.locale)}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  },
  text({ title, metric, rows }, ctx) {
    const metricLabel = resolveMetricLabel(metric.label, ctx.locale, metric.key);
    const valueOf = (row: LeaderboardRow) =>
      row.ratio === null ? "—" : resolveLocalizedText(row.display, ctx.locale);
    // 列宽随内容和可用列宽算，不硬编码：一个汉字记 2 列(stringWidth)
    const nameWidth = Math.max(0, ...rows.map((row) => stringWidth(row.label)));
    const tagWidth = Math.max(0, ...rows.map((row) => stringWidth(row.tag ?? "")));
    const valueWidth = Math.max(stringWidth(metricLabel), ...rows.map((row) => stringWidth(valueOf(row))));
    const gaps = tagWidth > 0 ? 6 : 4;
    const barWidth = Math.max(8, Math.min(24, ctx.width - nameWidth - tagWidth - valueWidth - gaps));
    const total = nameWidth + tagWidth + barWidth + valueWidth + gaps;

    const head = resolveLocalizedText(title, ctx.locale);
    const headPad = Math.max(1, total - stringWidth(head) - stringWidth(metricLabel));

    return [
      `${head}${" ".repeat(headPad)}${metricLabel}`,
      ...rows.map((row) => {
        const chart = row.ratio === null ? padEnd("—", barWidth) : bar(row.ratio, barWidth);
        const name = padEnd(row.label, nameWidth);
        const tag = tagWidth > 0 ? `  ${padEnd(row.tag ?? "", tagWidth)}` : "";
        return `${name}${tag}  ${chart}  ${padStart(valueOf(row), valueWidth)}`;
      }),
    ].join("\n");
  },
});

/**
 * 取数面：从当前 Scope 算通过率，按实验排名。
 * 显示名 = experiment id 去掉公共目录前缀(`compare/`)——完整 id 仍是身份键。
 */
export const Leaderboard = defineComponent(
  async (props: { title?: LocalizedText }, ctx) => {
    const board = await metricTableData(ctx.scope, {
      rows: "experiment",
      columns: [endToEndPassRate],
    });
    const metric = board.columns[0]!;
    // flags 随快照落盘,历史 run 也能按当时声明的记忆条件上色
    const memoryOf = new Map<string, string | null>(
      ctx.scope.snapshots.map((s) => [s.experimentId, (s.experiment?.flags?.memory as string | undefined) ?? null]),
    );

    const ids = board.rows.map((r) => r.key);
    const strip = commonPrefix(ids);
    const rows: LeaderboardRow[] = board.rows
      .map((r) => {
        const cell = r.cells[endToEndPassRate.name]!;
        const memory = memoryOf.get(r.key) ?? null;
        return {
          key: r.key,
          label: r.key.slice(strip.length) || r.key,
          tag: memory,
          ratio: cell.value,
          display: cell.display,
          color: memory === null ? null : (MEMORY_COLOR[memory] ?? null),
        };
      })
      // better: "higher" → 降序，「好」的一头在上；缺数据恒沉底，不冒充 0
      .sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1) || a.key.localeCompare(b.key));

    return (
      <Col>
        <Style>{CSS}</Style>
        <LeaderboardBars
          title={props.title ?? { en: "Leaderboard", "zh-CN": "排行榜" }}
          metric={{ key: metric.key, label: metric.label }}
          rows={rows}
        />
      </Col>
    );
  },
);

/** 一组 id 的公共目录前缀(含结尾斜杠);没有公共前缀时返回空串。 */
function commonPrefix(ids: readonly string[]): string {
  if (ids.length < 2) return "";
  const segsOf = (id: string) => id.split("/");
  const first = segsOf(ids[0]!);
  let depth = 0;
  while (depth < first.length - 1 && ids.every((id) => segsOf(id)[depth] === first[depth])) depth++;
  return depth === 0 ? "" : `${first.slice(0, depth).join("/")}/`;
}
