// 临时自定义报告,只用来冒烟验证 attempt 断言区能显示计分制 .points 与 t.score。
// 用完即删,不是长期报告。
import { AttemptSummary, SampleOverview, Table, defineReport, sources } from "niceeval/report";

export default defineReport({
  pages: [
    { id: "report", title: "Report", content: <SampleOverview /> },
    {
      id: "attempt",
      title: "Scoring smoke",
      input: "attempt",
      navigation: false,
      content: (
        <>
          <AttemptSummary />
          <Table source={sources.attempt.assertions} />
        </>
      ),
    },
  ],
});
