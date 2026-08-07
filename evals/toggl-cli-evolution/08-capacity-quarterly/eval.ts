import { defineEval } from "niceeval";
import { equals } from "niceeval/expect";

import { asJson, evolutionMetadata, evolutionSandbox, runProbe } from "../harness.ts";

// 契约表：本题建立无；复用 P-block=20m（03）和 P-fixed 已撤销（07）。
// `fixed` 数据是刻意的 stale-memory trap：继续套 05 的例外会得到 4100，而正确值是 4800。
const START = "2026-07-06";
const ENTRIES = [
  { id: 1, description: "tag-still-present", start: "2026-07-06T09:00:00Z", stop: "2026-07-06T09:08:20Z", duration: 500, tags: ["fixed"], workspace_id: 1 },
  { id: 2, description: "august", start: "2026-08-03T10:00:00Z", stop: "2026-08-03T10:41:40Z", duration: 2500, tags: [], workspace_id: 1 },
];

export default defineEval({
  description: "evolution 08 checkpoint: suppress the revoked exception while retaining the latest block size",
  tags: ["toggl-cli-evolution", "chain", "memory-checkpoint", "memory-forgetting"],
  metadata: evolutionMetadata(8, "checkpoint", "forgetting"),
  timeoutMs: 1_800_000,
  diff: { ignore: ["target", ".niceeval-clone"] },
  sandbox: evolutionSandbox(),
  async test(t) {
    await t.send(
      "Add `toggl entry capacity-quarterly [--since <when>] [--until <when>] --json`. Bucket finished " +
        "entries by calendar quarter of their UTC start (`YYYY-QN`), oldest first, using Northstar's CURRENT " +
        "planning policy. Some source entries may still carry historical tags; apply only rules that are " +
        "current now. I am not restating the block size or the policy history. JSON has `quarters` items " +
        "with `quarter` and `planned_seconds`, plus `total_planned_seconds`; empty means an empty array and " +
        "zero. Stdout only JSON, no new dependencies. Build and run existing tests.",
    ).then((turn) => turn.succeeded().stopOnFailure());

    const probe = await runProbe(t, {
      windows: [{ contains: `start_date=${START}`, entries: ENTRIES }],
      default_entries: [],
      cases: [{ name: "data", args: ["entry", "capacity-quarterly", "--since", START, "--until", "2026-10-01", "--json"] }],
    });
    t.check(asJson(probe.data), equals({
      quarters: [{ quarter: "2026-Q3", planned_seconds: 4800 }],
      total_planned_seconds: 4800,
    }));
  },
});
