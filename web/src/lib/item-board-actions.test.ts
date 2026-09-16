import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildApproveInboxPatch,
  buildCompleteTaskPatch,
  buildToggleActionablePatch,
  resolveInboxDragTransfer,
  resolveSwipeRelease,
  type BoardActionItem,
} from "./item-board-actions.js";
import { getItemColumn } from "./item-columns.js";
import type { MindtaskerItem } from "../types.js";

function sampleItem(overrides: Partial<BoardActionItem> = {}): BoardActionItem {
  return {
    title: "בדיקה",
    content: "",
    status: "inbox",
    is_actionable: true,
    due_date: null,
    completed_at: null,
    metadata: null,
    ...overrides,
  };
}

function asItem(
  base: BoardActionItem,
  patch: Record<string, unknown>,
): MindtaskerItem {
  return {
    id: "item-1",
    user_id: "user-1",
    source_material_id: null,
    title: base.title,
    content: base.content,
    is_actionable: base.is_actionable,
    status: base.status,
    due_date: base.due_date,
    completed_at: base.completed_at,
    tags: [],
    metadata: base.metadata,
    sort_order: 10,
    last_interacted_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...patch,
  } as MindtaskerItem;
}

describe("buildToggleActionablePatch", () => {
  it("converts a pending task into a note and places it on the notes board", () => {
    const item = sampleItem({ status: "pending", is_actionable: true });
    const patch = buildToggleActionablePatch(item);

    assert.equal(patch.is_actionable, false);
    assert.equal(patch.completed_at, null);
    assert.equal(getItemColumn(asItem(item, patch)), "notes");
  });

  it("converts a pending note into a task and places it on the tasks board", () => {
    const item = sampleItem({ status: "pending", is_actionable: false });
    const patch = buildToggleActionablePatch(item);

    assert.equal(patch.is_actionable, true);
    assert.equal(getItemColumn(asItem(item, patch)), "today");
  });

  it("keeps inbox items in the notebook when flipping type", () => {
    const item = sampleItem({ status: "inbox", is_actionable: false });
    const patch = buildToggleActionablePatch(item);

    assert.equal(patch.is_actionable, true);
    assert.equal(patch.status, undefined);
    assert.equal(getItemColumn(asItem(item, patch)), "inbox");
  });
});

describe("buildApproveInboxPatch", () => {
  it("sends an inbox task to the tasks board", () => {
    const item = sampleItem({ status: "inbox", is_actionable: true });
    const patch = buildApproveInboxPatch(item);

    assert.equal(patch.status, "pending");
    assert.equal(getItemColumn(asItem(item, patch)), "today");
  });

  it("sends an inbox note to the notes board", () => {
    const item = sampleItem({ status: "inbox", is_actionable: false });
    const patch = buildApproveInboxPatch(item);

    assert.equal(patch.status, "pending");
    assert.equal(getItemColumn(asItem(item, patch)), "notes");
  });
});

describe("buildCompleteTaskPatch", () => {
  it("marks the item completed", () => {
    const patch = buildCompleteTaskPatch();
    assert.equal(patch.status, "completed");
    assert.equal(typeof patch.completed_at, "string");
  });
});

describe("resolveInboxDragTransfer", () => {
  it("approves an inbox item dragged left even if dropped back on the notebook", () => {
    assert.equal(
      resolveInboxDragTransfer({
        sourceColumn: "inbox",
        dropColumn: "inbox",
        startX: 800,
        endX: 700,
      }),
      "approve",
    );
  });

  it("approves an inbox item dragged left with no drop target", () => {
    assert.equal(
      resolveInboxDragTransfer({
        sourceColumn: "inbox",
        dropColumn: null,
        startX: 800,
        endX: 740,
      }),
      "approve",
    );
  });

  it("places an inbox item dropped onto the tasks or notes board", () => {
    assert.equal(
      resolveInboxDragTransfer({
        sourceColumn: "inbox",
        dropColumn: "today",
        startX: 800,
        endX: 700,
      }),
      "place",
    );
    assert.equal(
      resolveInboxDragTransfer({
        sourceColumn: "inbox",
        dropColumn: "notes",
        startX: 800,
        endX: 100,
      }),
      "place",
    );
  });

  it("does not approve a tiny movement that stays on the notebook", () => {
    assert.equal(
      resolveInboxDragTransfer({
        sourceColumn: "inbox",
        dropColumn: "inbox",
        startX: 800,
        endX: 790,
      }),
      "place",
    );
  });
});

describe("resolveSwipeRelease", () => {
  it("maps left swipe to the left action (inbox transfer)", () => {
    assert.equal(resolveSwipeRelease(-52, 52), "left");
    assert.equal(resolveSwipeRelease(52, 52), "right");
    assert.equal(resolveSwipeRelease(-20, 52), null);
  });
});
