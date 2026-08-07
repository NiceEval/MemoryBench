import { defineEval } from "niceeval";
import { equals } from "niceeval/expect";

import { asJson, evolutionMetadata, evolutionSandbox, runProbe } from "../harness.ts";

// 契约表：本题建立无；复用 P-block=20m（03）与 P-fixed（05），验证默认值和局部覆盖可组合。
const DAY = "2026-06-15";
const ENTRIES = [
  { id: 1, description: "alpha-normal", start: `${DAY}T09:00:00Z`, stop: `${DAY}T09:11:40Z`, duration: 700, tags: [], workspace_id: 1, project_id: 11 },
  { id: 2, description: "alpha-fixed", start: `${DAY}T10:00:00Z`, stop: `${DAY}T10:08:20Z`, duration: 500, tags: ["fixed"], workspace_id: 1, project_id: 11 },
  { id: 3, description: "beta-normal", start: `${DAY}T11:00:00Z`, stop: `${DAY}T11:21:40Z`, duration: 1300, tags: [], workspace_id: 1, project_id: 12 },
];

export default defineEval({
  description: "evolution 06 checkpoint: compose Northstar's current default rule and scoped exception",
  tags: ["toggl-cli-evolution", "chain", "memory-checkpoint", "memory-scope"],
  metadata: evolutionMetadata(6, "checkpoint", "scoped-conflict"),
  timeoutMs: 1_800_000,
  diff: { ignore: ["target", ".niceeval-clone"] },
  sandbox: evolutionSandbox(),
  async test(t) {
    await t.send(
      "Add `toggl entry capacity-projects [--since <when>] [--until <when>] --json`. Aggregate finished " +
        "entries per project using Northstar's CURRENT planning rule, including its current exceptions. " +
        "I am not restating either. Longest first, ties alphabetical, `No Project` when needed. JSON has " +
        "`projects` items with `project` and `planned_seconds`, plus `total_planned_seconds`; empty means an " +
        "empty array and zero. Stdout only JSON, no new dependencies. Build and run existing tests.",
    ).then((turn) => turn.succeeded().stopOnFailure());

    const probe = await runProbe(t, {
      windows: [{ contains: `start_date=${DAY}`, entries: ENTRIES }],
      default_entries: [],
      cases: [{ name: "data", args: ["entry", "capacity-projects", "--since", DAY, "--until", DAY, "--json"] }],
    });
    t.check(asJson(probe.data), equals({
      projects: [
        { project: "Beta", planned_seconds: 2400 },
        { project: "Alpha", planned_seconds: 1700 },
      ],
      total_planned_seconds: 4100,
    }));
  },
});
