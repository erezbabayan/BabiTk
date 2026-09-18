import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCalendarRelevantPatch } from "./google-calendar-patch.ts";

describe("web calendar patch filter", () => {
  it("syncs dated-task writes and ignores board-only patches", () => {
    assert.equal(isCalendarRelevantPatch({ due_date: null }), true);
    assert.equal(isCalendarRelevantPatch({ title: "שיחה" }), true);
    assert.equal(isCalendarRelevantPatch({ deleted_at: "2026-09-18T08:00:00.000Z" }), true);
    assert.equal(isCalendarRelevantPatch({ sort_order: 20, metadata: {} }), false);
  });
});
