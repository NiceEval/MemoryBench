import { defineEval } from "niceeval";
import { equals } from "niceeval/expect";

import { asJson, evolutionMetadata, evolutionSandbox, runProbe } from "../harness.ts";

// 契约表：本题将 P-block 从 30m 更新为 20m；旧值被替换，不再并存。
const DAY = "2026-05-04";
const ENTRIES = [
  { id: 1, description: "short", start: `${DAY}T09:00:00Z`, stop: `${DAY}T09:10:00Z`, duration: 600, workspace_id: 1 },
  { id: 2, description: "long", start: `${DAY}T10:00:00Z`, stop: `${DAY}T10:31:40Z`, duration: 1900, workspace_id: 1 },
];

export default defineEval({
  description: "evolution 03: replace Northstar's 30-minute planning blocks with 20-minute blocks",
  tags: ["toggl-cli-evolution", "chain", "memory-update"],
  metadata: evolutionMetadata(3, "update", "update"),
  timeoutMs: 1_800_000,
  diff: { ignore: ["target", ".niceeval-clone"] },
  sandbox: evolutionSandbox(),
  async test(t) {
    await t.send(
      "Northstar changed planning policy after reviewing the first reports. The old 30-minute block is " +
        "obsolete: from now on round EACH finished entry UP to a 20-minute block, then aggregate. Replace " +
        "the old rule; do not keep both as alternatives. Add `toggl entry capacity-daily [--since <when>] " +
        "[--until <when>] --json`, bucketed by UTC start date, oldest first. JSON has a `days` array whose " +
        "items contain `day` and integer `planned_seconds`, plus an integer `total_planned_seconds`; empty " +
        "is an empty `days` array and zero total. Stdout only JSON, " +
        "no new dependencies. Build and run existing tests.",
    ).then((turn) => turn.succeeded().stopOnFailure());

    const probe = await runProbe(t, {
      windows: [{ contains: `start_date=${DAY}`, entries: ENTRIES }],
      default_entries: [],
      cases: [{ name: "data", args: ["entry", "capacity-daily", "--since", DAY, "--until", DAY, "--json"] }],
    });
    t.check(asJson(probe.data), equals({ days: [{ day: DAY, planned_seconds: 3600 }], total_planned_seconds: 3600 }));
  },
});
