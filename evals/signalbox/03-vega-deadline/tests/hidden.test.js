import assert from "node:assert/strict";
import test from "node:test";
import { vegaDeadlineFor } from "./src/vega-deadline.js";

const incident = (priority, status = "open") => ({
  id: "v-1", customer: "Vega", priority, audience: "customer", plan: "standard",
  status, createdAt: "2026-06-01T00:00:00Z",
});

test("applies only Vega's explicitly supplied windows", () => {
  assert.equal(vegaDeadlineFor(incident("P1")), "2026-06-01T00:10:00.000Z");
  assert.equal(vegaDeadlineFor(incident("P2")), "2026-06-01T00:45:00.000Z");
  assert.equal(vegaDeadlineFor(incident("P3")), "2026-06-01T06:00:00.000Z");
  assert.equal(vegaDeadlineFor(incident("P2", "closed")), null);
});
