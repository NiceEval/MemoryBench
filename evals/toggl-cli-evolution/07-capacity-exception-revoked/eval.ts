import { defineEval } from "niceeval";
import { equals } from "niceeval/expect";

import { asJson, evolutionMetadata, evolutionSandbox, runProbe } from "../harness.ts";

// 契约表：本题撤销 P-fixed（05）；P-block=20m（03）继续有效并重新覆盖所有 finished entries。
const DAY = "2026-07-06";
const ENTRIES = [
  { id: 1, description: "formerly-fixed", start: `${DAY}T09:00:00Z`, stop: `${DAY}T09:08:20Z`, duration: 500, tags: ["fixed"], workspace_id: 1 },
  { id: 2, description: "normal", start: `${DAY}T10:00:00Z`, stop: `${DAY}T10:21:40Z`, duration: 1300, tags: [], workspace_id: 1 },
];

export default defineEval({
  description: "evolution 07: revoke Northstar's fixed-tag exception after inconsistent reports",
  tags: ["toggl-cli-evolution", "chain", "memory-revocation"],
  metadata: evolutionMetadata(7, "revoke", "forgetting"),
  timeoutMs: 1_800_000,
  diff: { ignore: ["target", ".niceeval-clone"] },
  sandbox: evolutionSandbox(),
  async test(t) {
    await t.send(
      "The `fixed` exception made Northstar's reports inconsistent, so revoke it completely. From now on " +
        "the `fixed` tag has NO planning meaning: every finished entry uses the current planning block. " +
        "Keep the current block size itself unchanged. Add `toggl entry capacity-sprint [--since <when>] " +
        "[--until <when>] --json`, one aggregate for the requested window. JSON contains the integer key " +
        "`planned_seconds` (zero when empty), stdout only JSON. No new dependencies. Build " +
        "and run existing tests.",
    ).then((turn) => turn.succeeded().stopOnFailure());

    const probe = await runProbe(t, {
      windows: [{ contains: `start_date=${DAY}`, entries: ENTRIES }],
      default_entries: [],
      cases: [{ name: "data", args: ["entry", "capacity-sprint", "--since", DAY, "--until", DAY, "--json"] }],
    });
    t.check(asJson(probe.data), equals({ planned_seconds: 3600 }));
  },
});
