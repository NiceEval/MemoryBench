import {
  Col,
  ExperimentScatter,
  ExperimentTable,
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
});
