import {
  Col,
  CopyFixPrompt,
  ExperimentComparison,
  Hero,
  ScopeWarnings,
  SnapshotDiagnostics,
  defineReport,
} from "niceeval/report";
import { standard } from "niceeval/report/built-in";
import { GITHUB_ICON } from "./components/icons.ts";
import { Leaderboard } from "./components/leaderboard.tsx";

// 内建 standard 视图整站(报告 / Attempts / 追踪)+ 品牌外壳:标题与 GitHub 链接。
//
// 「报告」页在这里重写:排行榜要摆在散点图上面,而 extends 是整页继承、没有插槽——
// 想往内建页里插一块内容,只能把这一页逐字抄下来自己摆(候选上游 FR:页级 override /
// 内容插槽)。代价说清楚:只有这一页脱离了「跟随内建演进」,Attempts / 追踪 / attempt
// 详情三页仍从 standard.pages 原样继承,niceeval 升级照常生效。
export default defineReport({
  pages: [
    {
      id: "report",
      title: { en: "Report", "zh-CN": "报告" },
      content: (
        <Col>
          <Hero />
          <ScopeWarnings />
          <SnapshotDiagnostics />
          <CopyFixPrompt />
          <Leaderboard title={{ en: "MemoryBench", "zh-CN": "MemoryBench" }} />
          <ExperimentComparison />
        </Col>
      ),
    },
    ...standard.pages.filter((page) => page.id !== "report"),
  ],
  title: { en: "MemoryBench", "zh-CN": "MemoryBench" },
  links: [
    { label: "GitHub", href: "https://github.com/CorrectRoadH/memorybench", icon: GITHUB_ICON },
  ],
  // GA4:官方 snippet 直译成 head 声明(niceeval ≥0.8 的结构化 head 通道)。
  // react-grab 只在本地 `niceeval view` 时注入,线上构建由 vercel-build.sh 设置 VERCEL=1 挡掉。
  head: [
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
