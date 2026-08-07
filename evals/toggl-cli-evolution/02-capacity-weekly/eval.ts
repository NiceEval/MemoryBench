import { defineEval } from "niceeval";
import { equals } from "niceeval/expect";

import { asJson, evolutionMetadata, evolutionSandbox, runProbe } from "../harness.ts";

// 契约表：本题建立无；复用 P-block=30m（来自 01）。
const W1 = "2026-04-06";
const W2 = "2026-04-13";
const ENTRIES = [
  { id: 1, description: "short", start: `${W1}T09:00:00Z`, stop: `${W1}T09:10:00Z`, duration: 600, workspace_id: 1 },
  { id: 2, description: "long", start: `${W1}T10:00:00Z`, stop: `${W1}T10:31:40Z`, duration: 1900, workspace_id: 1 },
  { id: 3, description: "next", start: `${W2}T09:00:00Z`, stop: `${W2}T09:40:00Z`, duration: 2400, workspace_id: 1 },
];

export default defineEval({
  description: "evolution 02 checkpoint: apply the remembered Northstar planning rule by ISO week",
  tags: ["toggl-cli-evolution", "chain", "memory-checkpoint"],
  metadata: evolutionMetadata(2, "checkpoint", "retrieval"),
  timeoutMs: 1_800_000,
  diff: { ignore: ["target", ".niceeval-clone"] },
  sandbox: evolutionSandbox(),
  async test(t) {
    await t.send(
      "Add `toggl entry capacity-weekly [--since <when>] [--until <when>] --json`. Bucket finished entries " +
        "by ISO week using the Monday `YYYY-MM-DD`, oldest first, and compute amounts with the Northstar " +
        "capacity-planning rule we settled on. I am not restating that rule. JSON has a `weeks` array " +
        "whose items contain `week` and integer `planned_seconds`, plus an integer " +
        "`total_planned_seconds`; empty data uses an empty `weeks` array and zero total. " +
        "Stdout is only JSON. No new dependencies. Build and run existing tests.",
    ).then((turn) => turn.succeeded().stopOnFailure());

    const probe = await runProbe(t, {
      windows: [{ contains: `start_date=${W1}`, entries: ENTRIES }],
      default_entries: [],
      cases: [{ name: "data", args: ["entry", "capacity-weekly", "--since", W1, "--until", "2026-04-20", "--json"] }],
    });
    t.check(asJson(probe.data), equals({
      weeks: [
        { week: W1, planned_seconds: 5400 },
        { week: W2, planned_seconds: 3600 },
      ],
      total_planned_seconds: 9000,
    }));
  },
});
