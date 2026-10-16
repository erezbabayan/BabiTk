import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isActiveBoardItem,
  itemsInColumn,
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
