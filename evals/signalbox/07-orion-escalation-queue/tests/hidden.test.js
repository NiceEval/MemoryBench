import assert from "node:assert/strict";
import test from "node:test";
import { buildOrionEscalationQueue } from "./src/orion-queue.js";

const row = (id, priority, audience, plan, createdAt, status = "open") => ({
  id, customer: "Orion", priority, audience, plan, status, createdAt,
});

test("combines defaults, scope, exception, timestamps, and ordering", () => {
  const incidents = [
    row("z-standard", "P2", "customer", "standard", "2026-06-01T00:00:00-04:00"),
    row("a-p1", "P1", "internal", "standard", "2026-06-01T00:15:00-04:00"),
    row("regulated", "P2", "customer", "regulated", "2026-06-01T00:00:00-04:00"),
    row("internal", "P2", "internal", "regulated", "2026-06-01T00:00:00-04:00"),
    row("closed", "P1", "customer", "standard", "2026-05-01T00:00:00Z", "closed"),
  ];
  assert.deepEqual(buildOrionEscalationQueue(incidents), [
    { id: "regulated", deadline: "2026-06-01T04:10:00.000Z" },
    { id: "a-p1", deadline: "2026-06-01T04:20:00.000Z" },
    { id: "z-standard", deadline: "2026-06-01T04:20:00.000Z" },
    { id: "internal", deadline: "2026-06-01T04:30:00.000Z" },
  ]);
});
