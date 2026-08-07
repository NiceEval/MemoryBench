import { defineEval } from "niceeval";
import { equals } from "niceeval/expect";

import { asJson, evolutionMetadata, evolutionSandbox, runProbe } from "../harness.ts";

// 契约表：本题建立无；复用最新版 P-block=20m（03），且必须压过 01 的 30m 旧值。
const START = "2026-05-04";
const ENTRIES = [
  { id: 1, description: "may", start: "2026-05-04T09:00:00Z", stop: "2026-05-04T09:10:00Z", duration: 600, workspace_id: 1 },
  { id: 2, description: "june", start: "2026-06-01T10:00:00Z", stop: "2026-06-01T10:31:40Z", duration: 1900, workspace_id: 1 },
];

export default defineEval({
  description: "evolution 04 checkpoint: prefer the updated Northstar planning policy over stale memory",
  tags: ["toggl-cli-evolution", "chain", "memory-checkpoint", "memory-conflict"],
  metadata: evolutionMetadata(4, "checkpoint", "update"),
  timeoutMs: 1_800_000,
  diff: { ignore: ["target", ".niceeval-clone"] },
  sandbox: evolutionSandbox(),
  async test(t) {
    await t.send(
      "Add `toggl entry capacity-monthly [--since <when>] [--until <when>] --json`. Bucket finished entries " +
        "by UTC start month (`YYYY-MM`), oldest first, using Northstar's CURRENT capacity-planning policy. " +
        "Do not ask me to repeat the block size. JSON has `months` items with `month` and `planned_seconds`, " +
        "plus `total_planned_seconds`; empty means an empty array and zero. Stdout only JSON, no new " +
        "dependencies. Build and run existing tests.",
    ).then((turn) => turn.succeeded().stopOnFailure());

    const probe = await runProbe(t, {
      windows: [{ contains: `start_date=${START}`, entries: ENTRIES }],
      default_entries: [],
      cases: [{ name: "data", args: ["entry", "capacity-monthly", "--since", START, "--until", "2026-07-01", "--json"] }],
    });
    t.check(asJson(probe.data), equals({
      months: [
        { month: "2026-05", planned_seconds: 1200 },
        { month: "2026-06", planned_seconds: 2400 },
      ],
      total_planned_seconds: 3600,
    }));
  },
});
