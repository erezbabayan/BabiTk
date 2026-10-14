import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  inboxSendToBoardButtonLabel,
  inboxSendToBoardLabel,
  inboxSwipeActions,
  sendToBoardAriaLabel,
  sendToBoardButtonLabel,
} from "./item-swipe-actions.ts";
import type { MindtaskerItem } from "../types.ts";

function inboxItem(isActionable: boolean): MindtaskerItem {
  return {
    id: "item-1",
    user_id: "user-1",
    source_material_id: null,
    title: "בדיקה",
    content: "",
    is_actionable: isActionable,
    status: "inbox",
    due_date: null,
    completed_at: null,
    tags: [],
    metadata: null,
    sort_order: 10,
    last_interacted_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  } as MindtaskerItem;
}

describe("inboxSwipeActions", () => {
  it("uses swipe-left for transfer to the item's own board", () => {
    const task = inboxItem(true);
    const note = inboxItem(false);
    const taskSwipe = inboxSwipeActions(task, () => {}, () => {});
    const noteSwipe = inboxSwipeActions(note, () => {}, () => {});

    assert.equal(taskSwipe.left.label, "משימות");
    assert.equal(noteSwipe.left.label, "הערות");
    assert.equal(taskSwipe.right.label, "מחק");
    assert.equal(inboxSendToBoardLabel(task), "שלח למשימות");
    assert.equal(inboxSendToBoardLabel(note), "שלח להערות");
    assert.equal(inboxSendToBoardButtonLabel(task), "למשימות");
    assert.equal(inboxSendToBoardButtonLabel(note), "להערות");
    assert.equal(sendToBoardButtonLabel("שלח למשימות", false), "למשימות");
    assert.equal(sendToBoardButtonLabel("שלח להערות", true), "להערות");
    assert.equal(sendToBoardAriaLabel("שלח למשימות", false), "שלח למשימות");
  });
});
