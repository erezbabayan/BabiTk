import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildColumnMovePatch, buildPlaceColumnPatch } from "./item-columns.ts";

describe("buildPlaceColumnPatch", () => {
  it("keeps reminder metadata when a card moves between columns", () => {
    const metadata = {
      analysis: { notify_at: "2026-10-21T06:00:00.000Z" },
      checklist: [{ id: "1", text: "חלב", done: false }],
    };
    const patch = buildPlaceColumnPatch("inbox", "today", metadata);
    assert.equal(patch.is_actionable, true);
    assert.equal(patch.status, "pending");
    assert.deepEqual(patch.metadata, metadata);
  });

  it("does not replace metadata on a same-column reorder", () => {
    const patch = buildPlaceColumnPatch("today", "today", { reminder_sent: true });
    assert.deepEqual(patch, {});
  });

  it("moves an archived card onto the board without dropping metadata", () => {
    const metadata = { reminder_manual: true };
    const patch = buildPlaceColumnPatch(null, "inbox", metadata);
    assert.equal(patch.status, "inbox");
    assert.deepEqual(patch.metadata, metadata);
  });

  it("a move without the current metadata clears the stored json", () => {
    const wiped = buildColumnMovePatch("notes");
    assert.deepEqual(wiped.metadata, {});
  });
});
