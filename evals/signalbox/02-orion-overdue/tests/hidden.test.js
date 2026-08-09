import assert from "node:assert/strict";
import test from "node:test";
import { findOrionOverdue } from "./src/orion-overdue.js";

const row = (id, priority, createdAt, status = "open") => ({
  id, customer: "Orion", priority, audience: "customer", plan: "standard", status, createdAt,
});

test("finds overdue incidents with the remembered policy and ordering", () => {
  const incidents = [
    row("b", "P1", "2026-06-01T00:25:00Z"),
    row("future", "P2", "2026-06-01T00:01:00Z"),
    row("a", "P2", "2026-06-01T00:00:00Z"),
    row("c", "P1", "2026-06-01T00:20:00Z"),
    row("closed", "P1", "2026-05-31T00:00:00Z", "closed"),
  ];
  assert.deepEqual(findOrionOverdue(incidents, "2026-06-01T00:30:00Z"), ["c", "a", "b"]);
});
