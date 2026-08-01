import {
  Col,
  ExperimentScatter,
  ExperimentTable,
  RunNotices,
  SampleNotices,
  SampleSummary,
  defineReport,
} from "niceeval/report";
import { Leaderboard } from "./components/leaderboard.tsx";
import { MemoryBenchHero } from "./components/memorybench-hero.tsx";

// MemoryBench 只发布自己的报告页；ExperimentTable 的 Attempt 下钻由 view
// 自动接到官方 AttemptDetails，不要求业务报告复制 standard pages。
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
  ],
  title: { en: "MemoryBench", "zh-CN": "MemoryBench" },
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
