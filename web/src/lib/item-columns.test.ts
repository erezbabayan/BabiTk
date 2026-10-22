import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildColumnMovePatch,
  getItemColumn,
  isActiveBoardItem,
  isTaskArchiveItem,
  itemsInColumn,
  mergeTaskArchiveItems,
} from "./item-columns.ts";
import type { MindtaskerItem } from "../types.ts";

function item(overrides: Partial<MindtaskerItem> = {}): MindtaskerItem {
  return {
    id: "item-1",
    user_id: "user-1",
    source_material_id: null,
    title: "הערה",
    content: "",
    is_actionable: false,
    status: "inbox",
    due_date: null,
    tags: [],
    completed_at: null,
    deleted_at: null,
    metadata: null,
    sort_order: 10,
    created_at: "2026-10-16T00:00:00.000Z",
    updated_at: "2026-10-16T00:00:00.000Z",
    last_interacted_at: "2026-10-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("board columns hide deleted items", () => {
  it("treats a missing deleted_at as active", () => {
    assert.equal(isActiveBoardItem(item()), true);
    assert.equal(isActiveBoardItem(item({ deleted_at: null })), true);
    assert.equal(
      isActiveBoardItem(item({ deleted_at: "2026-10-16T04:00:00.000Z" })),
      false,
    );
  });

  it("does not keep a soft-deleted notebook row on the board", () => {
    const rows = [
      item({ id: "alive", title: "נשאר" }),
      item({
        id: "gone",
        title: "נמחק",
        deleted_at: "2026-10-16T04:00:00.000Z",
      }),
    ];
    assert.deepEqual(
      itemsInColumn(rows, "inbox").map((row) => row.id),
      ["alive"],
    );
  });
});

describe("notebook voice items move onto the tasks and notes boards", () => {
  it("keeps a classified inbox note in the notebook until the user moves it", () => {
    const note = item({
      title: "רעיון",
      status: "inbox",
      is_actionable: false,
      due_date: "2026-10-23T15:00:00+03:00",
      metadata: { source: "voice", reminder_manual: true },
    });
    assert.equal(getItemColumn(note), "inbox");

    const onTasks = item({ ...note, ...buildColumnMovePatch("today", note.metadata) });
    assert.equal(onTasks.status, "pending");
    assert.equal(onTasks.is_actionable, true);
    assert.equal(getItemColumn(onTasks), "today");

    const onNotes = item({ ...note, ...buildColumnMovePatch("notes", note.metadata) });
    assert.equal(onNotes.status, "pending");
    assert.equal(onNotes.is_actionable, false);
    assert.equal(getItemColumn(onNotes), "notes");
  });
});

describe("task archive unifies completed and snoozed items", () => {
  it("includes completed and archived tasks, not notes or active tasks", () => {
    assert.equal(
      isTaskArchiveItem(item({ is_actionable: true, status: "completed" })),
      true,
    );
    assert.equal(
      isTaskArchiveItem(item({ is_actionable: true, status: "snoozed_archive" })),
      true,
    );
    assert.equal(
      isTaskArchiveItem(item({ is_actionable: true, status: "pending" })),
      false,
    );
    assert.equal(
      isTaskArchiveItem(item({ is_actionable: false, status: "snoozed_archive" })),
      false,
    );
  });

  it("merges completed tasks into the archive without duplicate ids", () => {
    const archived = [
      item({ id: "a", is_actionable: true, status: "snoozed_archive" }),
    ];
    const completed = [
      item({ id: "a", is_actionable: true, status: "completed" }),
      item({ id: "b", is_actionable: true, status: "completed" }),
    ];
    assert.deepEqual(
      mergeTaskArchiveItems(archived, completed).map((row) => row.id),
      ["a", "b"],
    );
  });
});
