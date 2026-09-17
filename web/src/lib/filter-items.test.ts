import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  applyBoardItemFilters,
  isItemDateOverdue,
  isItemDueToday,
  isItemUndated,
} from "./filter-items.js";
import type { MindtaskerItem } from "../types.js";

function item(overrides: Partial<MindtaskerItem>): MindtaskerItem {
  return {
    id: overrides.id ?? "1",
    user_id: "u",
    source_material_id: null,
    title: overrides.title ?? "פריט",
    content: "",
    is_actionable: true,
    status: "pending",
    due_date: overrides.due_date ?? null,
    completed_at: null,
    calendar_event_id: null,
    tags: overrides.tags ?? [],
    metadata: {},
    sort_order: 0,
    last_interacted_at: "2026-09-17T10:00:00.000Z",
    created_at: "2026-09-17T10:00:00.000Z",
    updated_at: "2026-09-17T10:00:00.000Z",
    ...overrides,
  };
}

describe("board date filters", () => {
  const now = new Date("2026-09-17T12:00:00+03:00");

  it("marks today, overdue, and undated items", () => {
    const today = item({ due_date: "2026-09-17T18:00:00+03:00" });
    const past = item({ due_date: "2026-09-16T09:00:00+03:00" });
    const laterTodayOverdue = item({ due_date: "2026-09-17T08:00:00+03:00" });
    const none = item({ due_date: null });

    assert.equal(isItemDueToday(today, now), true);
    assert.equal(isItemDueToday(past, now), false);
    assert.equal(isItemDateOverdue(past, now), true);
    assert.equal(isItemDateOverdue(laterTodayOverdue, now), true);
    assert.equal(isItemDateOverdue(today, now), false);
    assert.equal(isItemUndated(none), true);
    assert.equal(isItemUndated(today), false);
  });

  it("filters a board list by overdue and undated", () => {
    const items = [
      item({ id: "today", due_date: "2026-09-17T18:00:00+03:00" }),
      item({ id: "past", due_date: "2026-09-10T09:00:00+03:00" }),
      item({ id: "none", due_date: null }),
      item({ id: "future", due_date: "2026-09-20T09:00:00+03:00" }),
    ];
    assert.deepEqual(
      applyBoardItemFilters(items, null, false, "overdue", now).map((row) => row.id),
      ["past"],
    );
    assert.deepEqual(
      applyBoardItemFilters(items, null, false, "undated", now).map((row) => row.id),
      ["none"],
    );
    assert.deepEqual(
      applyBoardItemFilters(items, null, false, "today", now).map((row) => row.id),
      ["today"],
    );
    assert.deepEqual(
      applyBoardItemFilters(items, null, false, true, now).map((row) => row.id),
      ["today"],
    );
    assert.deepEqual(
      applyBoardItemFilters(items, null, false, "all", now).map((row) => row.id),
      ["today", "past", "none", "future"],
    );
  });

  it("treats analysis.target_at as the card date when due_date is empty", () => {
    const scheduled = item({
      id: "target",
      due_date: null,
      metadata: {
        analysis: {
          goal: "",
          source: "",
          data_points: "",
          task: "",
          urgency: "חסר",
          time_mention: "",
          target_at: "2026-09-10T09:00:00+03:00",
          notify_at: null,
          formatted: "",
        },
      },
    });
    assert.equal(isItemUndated(scheduled), false);
    assert.equal(isItemDateOverdue(scheduled, now), true);
    assert.deepEqual(
      applyBoardItemFilters([scheduled], null, false, "undated", now).map((row) => row.id),
      [],
    );
    assert.deepEqual(
      applyBoardItemFilters([scheduled], null, false, "overdue", now).map((row) => row.id),
      ["target"],
    );
  });
});
