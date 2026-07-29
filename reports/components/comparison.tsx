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

const agentLine: GroupFunction = (subject) =>
  String(subject.run.experiment?.labels?.line ?? subject.run.agent);

export const Comparison = defineComponent(async (_props, ctx) => {
  const rows = await aggregate(ctx.scope, {
    by: { experiment, line: agentLine },
    values: { costUSD, passRate },
  });

  return [
    <Scatter
      key="scatter"
      points={rows}
      x="costUSD"
      y="passRate"
      point="experiment"
      series="line"
      connect
      legend
    />,
    <Table
      key="table"
      rows={rows}
      columns={["experiment", "line", "costUSD", "passRate"]}
      sort="passRate"
      searchable
    />,
  ];
});

Comparison.displayName = "Comparison";
