import assert from "node:assert/strict";
import test from "node:test";
import { orionDeadlineFor } from "./src/orion-deadline.js";

const incident = (overrides = {}) => ({
  id: "i-1", customer: "Orion", priority: "P2", audience: "customer",
  plan: "standard", status: "open", createdAt: "2026-06-01T09:00:00-04:00", ...overrides,
});

test("applies Orion's original windows and ignores closed incidents", () => {
  assert.equal(orionDeadlineFor(incident({ priority: "P1" })), "2026-06-01T13:05:00.000Z");
  assert.equal(orionDeadlineFor(incident()), "2026-06-01T13:30:00.000Z");
  assert.equal(orionDeadlineFor(incident({ priority: "P3" })), "2026-06-01T17:00:00.000Z");
  assert.equal(orionDeadlineFor(incident({ status: "closed" })), null);
});
