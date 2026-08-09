import assert from "node:assert/strict";
import test from "node:test";
import { orionWindowMinutes } from "./src/orion-window.js";

const incident = (priority, audience = "customer", status = "open") => ({
  id: "o-1", customer: "Orion", priority, audience, plan: "standard", status,
  createdAt: "2026-06-01T00:00:00Z",
});

test("scopes Orion's P2 update by audience", () => {
  assert.equal(orionWindowMinutes(incident("P1")), 5);
  assert.equal(orionWindowMinutes(incident("P2", "customer")), 20);
  assert.equal(orionWindowMinutes(incident("P2", "internal")), 30);
  assert.equal(orionWindowMinutes(incident("P3", "internal")), 240);
  assert.equal(orionWindowMinutes(incident("P2", "customer", "closed")), null);
});
