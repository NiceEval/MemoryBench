import { Either } from "effect";
import {
  definePage,
  defineReport,
  reportComponentId,
  reportDocument,
  reportId,
  reportMetric,
  reportRoute,
} from "niceeval/report";

/**
 * 当前报告 API 只接受声明式 projection/calculation/page 图，而不再接收 React 组件或
 * Record reader。详细 attempt、断言与时序由 NiceEval 内建页面提供；本页保留
 * MemoryBench 的入口说明，避免复制另一套结果读取路径。
 */
const overview = definePage({
  id: Either.getOrThrow(reportComponentId("memorybench-overview")),
  route: Either.getOrThrow(reportRoute("/")),
  render: () =>
    reportDocument({
      title: "MemoryBench",
      children: [
        reportMetric({
          label: "Benchmark focus",
          value: "Coding-agent task completion under comparable memory conditions",
        }),
      ],
    }),
});

export default defineReport({
  id: Either.getOrThrow(reportId("memorybench")),
  pages: [overview],
});
