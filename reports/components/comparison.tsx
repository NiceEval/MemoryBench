import {
  Scatter,
  Table,
  aggregate,
  costUSD,
  defineComponent,
  experiment,
  passRate,
} from "niceeval/report";
import type { GroupFunction } from "niceeval/report";
import type { Sample } from "niceeval/record";

const agentLine: GroupFunction = (subject) =>
  String(subject.run.experiment?.labels?.line ?? subject.run.agent);

function comparisonRows(sample: Sample) {
  return aggregate(sample, {
    by: { experiment, line: agentLine },
    values: { costUSD, passRate },
  });
}

export const CostPassRateScatter = defineComponent(async (_props, ctx) => {
  const rows = await comparisonRows(ctx.scope);
  return (
    <Scatter
      points={rows}
      x="costUSD"
      y="passRate"
      point="experiment"
      series="line"
      connect
      legend
    />
  );
});

CostPassRateScatter.displayName = "CostPassRateScatter";

export const CostPassRateTable = defineComponent(async (_props, ctx) => {
  const rows = await comparisonRows(ctx.scope);
  return (
    <Table
      rows={rows}
      columns={["experiment", "line", "costUSD", "passRate"]}
      sort="passRate"
      searchable
    />
  );
});

CostPassRateTable.displayName = "CostPassRateTable";
