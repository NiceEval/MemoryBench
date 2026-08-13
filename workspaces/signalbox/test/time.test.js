import assert from "node:assert/strict";
import test from "node:test";

import { addMinutes, compareDeadlineThenId } from "../src/time.js";

test("adds minutes and emits UTC ISO timestamps", () => {
  assert.equal(addMinutes("2026-06-01T09:00:00-04:00", 20), "2026-06-01T13:20:00.000Z");
});

test("orders deadlines before ids", () => {
  const rows = [
    { id: "b", deadline: "2026-01-01T00:00:00.000Z" },
    { id: "a", deadline: "2026-01-01T00:00:00.000Z" },
  ];
  assert.deepEqual(rows.sort(compareDeadlineThenId).map((row) => row.id), ["a", "b"]);
});
