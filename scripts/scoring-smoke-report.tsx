// 临时自定义报告,只用来冒烟验证 attempt 断言区能显示计分制 .points 与 t.score。
// 用完即删,不是长期报告。
import {
  AttemptSummary,
  SampleOverview,
  Table,
  defineReport,
  toAttemptAssertions,
  toAttemptSummary,
} from "niceeval/report";

export default defineReport({
  pages: [
    {
      id: "report",
      title: "Report",
      render: (sample) => <SampleOverview input={sample} />,
    },
    {
      id: "attempt",
      title: "Scoring smoke",
      input: "attempt",
      navigation: false,
      render: async (attempt) => {
        const [summary, assertions] = await Promise.all([
          toAttemptSummary(attempt),
          toAttemptAssertions(attempt),
        ]);
        const rows = (assertions?.rows ?? []).map((row) => ({
          name: row.cells.name,
          severity: row.cells.severity,
          outcome: row.cells.outcome,
          detail: row.cells.detail,
        }));

        return (
          <>
            <AttemptSummary data={summary} />
            <Table rows={rows} />
          </>
        );
      },
    },
  ],
});
