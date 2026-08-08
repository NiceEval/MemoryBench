import assert from "node:assert/strict";
import test from "node:test";
import { exportOrionBreachesCsv } from "./src/orion-breach-csv.js";

const row = (id, priority, audience, plan, createdAt, status = "open") => ({
  id, customer: "Orion", priority, audience, plan, status, createdAt,
});

test("exports current breaches without reviving the revoked exception", () => {
  const incidents = [
    row("regulated", "P2", "customer", "regulated", "2026-06-01T00:00:00Z"),
    row("future", "P2", "customer", "standard", "2026-06-01T00:10:00Z"),
    row("internal", "P2", "internal", "regulated", "2026-05-31T23:50:00Z"),
    row("p1", "P1", "customer", "standard", "2026-06-01T00:19:00Z"),
    row("closed", "P1", "customer", "standard", "2026-05-01T00:00:00Z", "closed"),
  ];
  assert.equal(
    exportOrionBreachesCsv(incidents, "2026-06-01T00:25:00Z"),
    "id,deadline\ninternal,2026-06-01T00:20:00.000Z\nregulated,2026-06-01T00:20:00.000Z\np1,2026-06-01T00:24:00.000Z\n",
  );
});
