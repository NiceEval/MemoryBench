import { defineEval } from "niceeval";
import { equals } from "niceeval/expect";

import { asJson, evolutionMetadata, evolutionSandbox, runProbe } from "../harness.ts";

// 契约表：本题建立 P-fixed（tag=fixed 的 finished entry 保留精确秒数）；
// 同时复用 P-block=20m（03）作为其它条目的默认规则。
const DAY = "2026-06-08";
const ENTRIES = [
  { id: 1, description: "normal", start: `${DAY}T09:00:00Z`, stop: `${DAY}T09:10:00Z`, duration: 600, tags: [], workspace_id: 1 },
  { id: 2, description: "fixed", start: `${DAY}T10:00:00Z`, stop: `${DAY}T10:11:40Z`, duration: 700, tags: ["fixed"], workspace_id: 1 },
];

export default defineEval({
  description: "evolution 05: add a scoped exact-time exception to Northstar's current planning policy",
  tags: ["toggl-cli-evolution", "chain", "memory-update", "memory-scope"],
  metadata: evolutionMetadata(5, "update", "scoped-conflict"),
  timeoutMs: 1_800_000,
  diff: { ignore: ["target", ".niceeval-clone"] },
  sandbox: evolutionSandbox(),
  async test(t) {
    await t.send(
      "Northstar needs one exception to the CURRENT capacity-planning rule. Finished entries tagged " +
        "`fixed` keep their exact duration in seconds; every other finished entry still uses the current " +
        "planning block. This is a standing scoped exception, not a replacement for the default rule. Add " +
        "`toggl entry capacity-review [--since <when>] [--until <when>] --json`, grouped by UTC start date. " +
        "JSON has `days` items with `day` and `planned_seconds`, plus `total_planned_seconds`; empty means an " +
        "empty array and zero. Stdout only JSON, no new dependencies. Build and run existing tests.",
    ).then((turn) => turn.succeeded().stopOnFailure());

    const probe = await runProbe(t, {
      windows: [{ contains: `start_date=${DAY}`, entries: ENTRIES }],
      default_entries: [],
      cases: [{ name: "data", args: ["entry", "capacity-review", "--since", DAY, "--until", DAY, "--json"] }],
    });
    t.check(asJson(probe.data), equals({ days: [{ day: DAY, planned_seconds: 1900 }], total_planned_seconds: 1900 }));
  },
});
