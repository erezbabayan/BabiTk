import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildColumnMovePatch, buildPlaceColumnPatch, getItemColumn } from "./item-columns.ts";
import type { MindtaskerItem } from "./supabase";

function notebookVoiceItem(overrides: Partial<MindtaskerItem>): MindtaskerItem {
  return {
    status: "inbox",
    is_actionable: false,
    metadata: { source: "voice", reminder_manual: true },
    due_date: "2026-10-23T15:00:00+03:00",
    ...overrides,
  } as MindtaskerItem;
}

describe("notebook voice items move onto the tasks and notes boards", () => {
  it("keeps a classified inbox note in the notebook until the user moves it", () => {
    const note = notebookVoiceItem({});
    assert.equal(getItemColumn(note), "inbox");

    const onTasks = notebookVoiceItem({ ...note, ...buildColumnMovePatch("today", note.metadata) });
    assert.equal(onTasks.status, "pending");
    assert.equal(onTasks.is_actionable, true);
    assert.equal(getItemColumn(onTasks), "today");

    const onNotes = notebookVoiceItem({ ...note, ...buildColumnMovePatch("notes", note.metadata) });
    assert.equal(onNotes.status, "pending");
    assert.equal(onNotes.is_actionable, false);
    assert.equal(getItemColumn(onNotes), "notes");
  });
});

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
