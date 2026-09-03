import assert from "node:assert/strict";
import test from "node:test";
import { summarizeOrionBreaches } from "./src/orion-summary.js";

const row = (id, priority, audience, createdAt, status = "open") => ({
  id, customer: "Orion", priority, audience, plan: "standard", status, createdAt,
});

test("uses the latest scoped Orion policy without Vega interference", () => {
  const incidents = [
    row("customer-p2", "P2", "customer", "2026-06-01T00:00:00Z"),
    row("internal-p2", "P2", "internal", "2026-06-01T00:00:00Z"),
    row("p1", "P1", "internal", "2026-06-01T00:20:00Z"),
    row("p3", "P3", "customer", "2026-05-31T20:25:00Z"),
    row("closed", "P1", "customer", "2026-05-01T00:00:00Z", "closed"),
  ];
  assert.deepEqual(summarizeOrionBreaches(incidents, "2026-06-01T00:25:00Z"), {
    open: 4,
    breached: 3,
    byPriority: { P1: 1, P2: 1, P3: 1 },
  });
});
