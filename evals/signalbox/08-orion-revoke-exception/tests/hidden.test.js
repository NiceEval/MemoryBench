import assert from "node:assert/strict";
import test from "node:test";
import { orionWindowMinutes } from "./src/orion-window.js";

const incident = (priority, audience = "customer", plan = "standard", status = "open") => ({
  id: "o-1", customer: "Orion", priority, audience, plan, status,
  createdAt: "2026-06-01T00:00:00Z",
});

test("suppresses the revoked exception while retaining prior valid updates", () => {
  assert.equal(orionWindowMinutes(incident("P2", "customer", "regulated")), 20);
  assert.equal(orionWindowMinutes(incident("P2", "customer", "standard")), 20);
  assert.equal(orionWindowMinutes(incident("P2", "internal", "regulated")), 30);
  assert.equal(orionWindowMinutes(incident("P1")), 5);
  assert.equal(orionWindowMinutes(incident("P3")), 240);
  assert.equal(orionWindowMinutes(incident("P2", "customer", "regulated", "closed")), null);
});
