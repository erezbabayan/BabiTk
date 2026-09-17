import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bulkActionCounts,
  itemsForBulkAction,
  matchesBulkAction,
  sendToBoardBulkLabel,
  type BoardBulkItem,
} from "./board-bulk-actions.js";

function item(overrides: Partial<BoardBulkItem> = {}): BoardBulkItem {
  return {
    id: overrides.id ?? "a",
    is_actionable: overrides.is_actionable ?? true,
    status: overrides.status ?? "pending",
  };
}

describe("matchesBulkAction", () => {
  it("completes only open actionable items", () => {
    assert.equal(matchesBulkAction(item(), "complete"), true);
    assert.equal(matchesBulkAction(item({ is_actionable: false }), "complete"), false);
    assert.equal(matchesBulkAction(item({ status: "completed" }), "complete"), false);
    assert.equal(matchesBulkAction(item({ status: "inbox" }), "complete"), true);
  });

  it("archives open items and restores archived/completed ones", () => {
    assert.equal(matchesBulkAction(item({ status: "pending" }), "archive"), true);
    assert.equal(matchesBulkAction(item({ status: "snoozed_archive" }), "archive"), false);
    assert.equal(matchesBulkAction(item({ status: "snoozed_archive" }), "restore"), true);
    assert.equal(matchesBulkAction(item({ status: "completed" }), "restore"), true);
    assert.equal(matchesBulkAction(item({ status: "pending" }), "restore"), false);
  });

  it("converts notes and tasks in the matching direction", () => {
    assert.equal(matchesBulkAction(item({ is_actionable: true }), "convertToNote"), true);
    assert.equal(matchesBulkAction(item({ is_actionable: true }), "convertToTask"), false);
    assert.equal(matchesBulkAction(item({ is_actionable: false }), "convertToTask"), true);
  });

  it("sends only inbox items to the board", () => {
    assert.equal(matchesBulkAction(item({ status: "inbox" }), "sendToBoard"), true);
    assert.equal(matchesBulkAction(item({ status: "pending" }), "sendToBoard"), false);
  });
});

describe("itemsForBulkAction / counts", () => {
  it("filters mixed selections to the actions that apply", () => {
    const items = [
      item({ id: "task", is_actionable: true, status: "pending" }),
      item({ id: "note", is_actionable: false, status: "pending" }),
      item({ id: "inbox", is_actionable: true, status: "inbox" }),
    ];
    assert.deepEqual(
      itemsForBulkAction(items, "complete").map((entry) => entry.id),
      ["task", "inbox"],
    );
    assert.equal(bulkActionCounts(items).convertToNote, 2);
    assert.equal(bulkActionCounts(items).convertToTask, 1);
    assert.equal(bulkActionCounts(items).sendToBoard, 1);
    assert.equal(bulkActionCounts(items).delete, 3);
  });
});

describe("sendToBoardBulkLabel", () => {
  it("uses a specific board name when the selection is uniform", () => {
    assert.equal(
      sendToBoardBulkLabel([item({ status: "inbox", is_actionable: true })]),
      "שלח למשימות",
    );
    assert.equal(
      sendToBoardBulkLabel([item({ status: "inbox", is_actionable: false })]),
      "שלח להערות",
    );
    assert.equal(
      sendToBoardBulkLabel([
        item({ id: "t", status: "inbox", is_actionable: true }),
        item({ id: "n", status: "inbox", is_actionable: false }),
      ]),
      "שלח ללוח",
    );
  });
});
