import {
  Col,
  ExperimentScatter,
  ExperimentTable,
  SampleSummary,
  defineComponent,
  defineReport,
  type Page,
  type PageParams,
  type Sample,
} from "niceeval/report";
import {
  experimentComparisonScope,
  experimentGroups,
  narrowSample,
  type ExperimentComparisonScope,
  type ExperimentGroupIdentity,
  type ExperimentId,
} from "niceeval/analysis";
import {
  standardAttemptPage,
  standardExperimentPage,
} from "niceeval/report/built-in";
import { Leaderboard } from "./components/leaderboard.tsx";
import { MemoryBenchHero } from "./components/memorybench-hero.tsx";

interface GroupPageInput {
  readonly comparison: ExperimentComparisonScope;
  readonly sample: Sample;
}

type NamedGroupParams = Extract<ExperimentGroupIdentity, { readonly kind: "named" }>;
type SingletonGroupParams = Extract<ExperimentGroupIdentity, { readonly kind: "singleton" }>;

const namedGroupParams: PageParams<NamedGroupParams> = {
  encode: ({ groupId }) => groupId,
  decode: (key) => {
    if (!isCanonicalGroupKey(key)) throw new TypeError("named Experiment Group key is not canonical");
    return { kind: "named", groupId: key, key: `named/${key}` };
  },
  enumerate: (sample) => experimentGroups(sample)
    .map(({ group }) => group)
    .filter((group): group is NamedGroupParams => group.kind === "named"),
};

const singletonGroupParams: PageParams<SingletonGroupParams> = {
  encode: ({ experimentId }) => String(experimentId),
  decode: (key) => {
    if (!isCanonicalGroupKey(key)) throw new TypeError("singleton Experiment Group key is not canonical");
    return {
      kind: "singleton",
      experimentId: key as ExperimentId,
      key: `singleton/${key}`,
    };
  },
  enumerate: (sample) => experimentGroups(sample)
    .map(({ group }) => group)
    .filter((group): group is SingletonGroupParams => group.kind === "singleton"),
};

function loadGroupPage(sample: Sample, group: ExperimentGroupIdentity): GroupPageInput {
  const comparison = experimentComparisonScope(sample, group);
  const members = new Set(
    comparison.comparison.state === "comparable"
      ? comparison.comparison.members.map(String)
      : comparison.comparison.issues.flatMap((issue) => issue.members.map(String)),
  );
  const runIds = sample.snapshot.runs
    .filter((run) => members.has(String(run.experimentId)))
    .map((run) => run.runId);
  return { comparison, sample: narrowSample(sample, { runIds }) };
}

const namedGroupPage = {
  id: "group-named",
  path: "/group/named",
  title: { en: "Report", "zh-CN": "报告" },
  navigation: false,
  presentation: "page",
  role: { kind: "experiment-group", groupKind: "named" },
  params: namedGroupParams,
  load: loadGroupPage,
  render: ({ comparison, sample }) => <MemoryBenchOverview comparison={comparison} sample={sample} />,
} satisfies Page<NamedGroupParams, GroupPageInput>;

const singletonGroupPage = {
  id: "group-singleton",
  path: "/group/singleton",
  title: { en: "Report", "zh-CN": "报告" },
  navigation: false,
  presentation: "page",
  role: { kind: "experiment-group", groupKind: "singleton" },
  params: singletonGroupParams,
  load: loadGroupPage,
  render: ({ comparison, sample }) => <MemoryBenchOverview comparison={comparison} sample={sample} />,
} satisfies Page<SingletonGroupParams, GroupPageInput>;

const MemoryBenchOverview = defineComponent<GroupPageInput>(({
  comparison,
  sample,
}) => {
  return (
    <Col>
      <MemoryBenchHero />
      <SampleSummary input={sample} />
      <Leaderboard input={sample} />
      <ExperimentScatter comparison={comparison} />
      <ExperimentTable comparison={comparison} />
    </Col>
  );
});

function isCanonicalGroupKey(key: string): boolean {
  return /^[a-z0-9][a-z0-9._~-]*$/u.test(key);
}

// ReportDefinition.pages 是站点的唯一页面集合。MemoryBench 显式复用官方
// 参数页，ExperimentTable 的链接因此始终指向同一份已闭合详情。
export default defineReport({
  pages: [
    {
      id: "report",
      title: { en: "Report", "zh-CN": "报告" },
      render: (sample) => (
        <Col>
          <MemoryBenchHero />
          <SampleSummary input={sample} />
        </Col>
      ),
    },
    namedGroupPage,
    singletonGroupPage,
    standardAttemptPage,
    standardExperimentPage,
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
