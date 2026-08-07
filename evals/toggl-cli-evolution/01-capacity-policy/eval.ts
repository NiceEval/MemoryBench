import { defineEval } from "niceeval";
import { equals } from "niceeval/expect";

import { asJson, evolutionMetadata, evolutionSandbox, runProbe } from "../harness.ts";

// 契约表：本题建立 P-block=30m；不复用前序约定。
const DAY = "2026-04-06";
const ENTRIES = [
  { id: 1, description: "triage", start: `${DAY}T09:00:00Z`, stop: `${DAY}T09:07:00Z`, duration: 420, workspace_id: 1, project_id: 11 },
  { id: 2, description: "design", start: `${DAY}T10:00:00Z`, stop: `${DAY}T10:35:00Z`, duration: 2100, workspace_id: 1, project_id: 11 },
  { id: 3, description: "running", start: `${DAY}T13:00:00Z`, duration: -1, workspace_id: 1, project_id: 12 },
];

export default defineEval({
  description: "evolution 01: establish Northstar's 30-minute capacity-planning rule",
  tags: ["toggl-cli-evolution", "chain", "memory-addition"],
  metadata: evolutionMetadata(1, "learn", "addition"),
  timeoutMs: 1_800_000,
  diff: { ignore: ["target", ".niceeval-clone"] },
  sandbox: evolutionSandbox(),
  async test(t) {
    await t.send(
      "In toggl-cli, add `toggl entry capacity [--since <when>] [--until <when>] --json` for Northstar " +
        "planning. This is a standing Northstar rule: ignore still-running entries, then round EACH finished " +
        "entry UP to a 30-minute planning block before summing by project. Do not round after aggregation. " +
        "JSON has a `projects` array whose items contain `project` and integer `planned_seconds`, plus an " +
        "integer `total_planned_seconds`; longest project first, ties alphabetical, and use `No Project` " +
        "when needed. Empty data is `{\"projects\":[],\"total_planned_seconds\":0}`. Stdout is only JSON. " +
        "No new dependencies. Build and run the existing tests when done.",
    ).then((turn) => turn.succeeded().stopOnFailure());

    const probe = await runProbe(t, {
      windows: [{ contains: `start_date=${DAY}`, entries: ENTRIES }],
      default_entries: [],
      cases: [
        { name: "data", args: ["entry", "capacity", "--since", DAY, "--until", DAY, "--json"] },
        { name: "empty", args: ["entry", "capacity", "--since", "2026-01-01", "--until", "2026-01-01", "--json"] },
      ],
    });

    t.check(asJson(probe.data), equals({ projects: [{ project: "Alpha", planned_seconds: 5400 }], total_planned_seconds: 5400 }));
    t.check(asJson(probe.empty), equals({ projects: [], total_planned_seconds: 0 }));
  },
});
