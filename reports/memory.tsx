import {
  Col,
  ExperimentScatter,
  ExperimentTable,
  SampleSummary,
  definePricingProfile,
  defineReport,
} from "niceeval/report";
import {
  standardAttemptPage,
  standardExperimentPage,
} from "niceeval/report/built-in";
import { Leaderboard } from "./components/leaderboard.tsx";
import { MemoryBenchHero } from "./components/memorybench-hero.tsx";

// Report-author estimate only. Analysis retains provider-cost observations as
// observed evidence; this rate card never writes back to or replaces them.
const memoryBenchPricing = definePricingProfile({
  currency: "USD",
  display: { decimalPlaces: 6, rounding: "half-away-from-zero" },
  provenance: {
    kind: "declared-rate-card",
    source: "models.dev snapshot vendored by NiceEval bad27524 on 2026-08-10",
    asOf: 1786345368000,
  },
  coverage: [
    {
      coverageId: "memorybench-codex-gpt-5-6-luna-2026-08-10",
      state: "priced",
      selector: { provider: "codex", model: "gpt-5.6-luna" },
      effective: { startsAt: 1786345368000, endsAt: null },
      charges: [
        { kind: "token", bucket: "input", perMillionTokens: "0.2" },
        { kind: "token", bucket: "output", perMillionTokens: "1.2" },
        { kind: "token", bucket: "cache-read", perMillionTokens: "0.02" },
        { kind: "token", bucket: "cache-write", perMillionTokens: "0.25" },
        // Model requests are deliberately priced at zero: the token rates are
        // complete, rather than relying on a missing-charge fallback.
        { kind: "request", requestKind: "model", ratePerRequest: "0" },
      ],
    },
  ],
});

// ReportDefinition.pages 是站点的唯一页面集合。MemoryBench 显式复用官方
// 参数页，ExperimentTable 的链接因此始终指向同一份已闭合详情。
export default defineReport({
  pages: [
    {
      id: "report",
      title: { en: "Report", "zh-CN": "报告" },
      render: () => (
        <Col>
          <MemoryBenchHero />
          <SampleSummary />
          <Leaderboard />
          <ExperimentScatter />
          <ExperimentTable />
        </Col>
      ),
    },
    standardAttemptPage,
    standardExperimentPage,
  ],
  title: { en: "MemoryBench", "zh-CN": "MemoryBench" },
  pricing: memoryBenchPricing,
  // GA4:官方 snippet 直译成 head 声明(niceeval ≥0.8 的结构化 head 通道)。
  // react-grab 只在本地 `niceeval view` 时注入,线上构建由 vercel-build.sh 设置 VERCEL=1 挡掉。
  head: [
    {
      tag: "meta",
      attrs: {
        name: "description",
        content: "MemoryBench evaluates whether memory helps coding agents complete real development tasks.",
      },
    },
    ...(process.env.VERCEL
      ? []
      : [
          {
            tag: "script" as const,
            attrs: { src: "https://unpkg.com/react-grab/dist/index.global.js", crossorigin: "anonymous" },
          },
        ]),
    { tag: "script", attrs: { async: true, src: "https://www.googletagmanager.com/gtag/js?id=G-Q30H5WX93X" } },
    {
      tag: "script",
      children: `
        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }
        gtag("js", new Date());
        gtag("config", "G-Q30H5WX93X");
      `,
    },
    {
      tag: "script",
      attrs: {
        defer: true,
        src: "https://vibeloft.ai/telemetry/v1.js",
        "data-vl-product-id": "b5b155b2-4d7d-426e-89f8-95eaa1f61ba9",
        "data-vl-auth-key": "vl_web.tNU554AVLZ9teAF7JNdkBIMn7Y38bT0j3Se4mblmnmQ",
      },
    },
  ],
});
