import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyBoardItemFilters,
  boardFiltersActive,
  isItemDueToday,
  isItemDueTomorrow,
  isItemOverdue,
  isItemUndated,
  type BoardDateFilter,
} from "./filter-items.js";
import type { MindtaskerItem } from "../types.js";

function item(overrides: Partial<MindtaskerItem> = {}): MindtaskerItem {
  return {
    id: overrides.id ?? "1",
    user_id: "user",
    source_material_id: null,
    title: "פריט",
    content: "",
    is_actionable: true,
    status: "pending",
    due_date: null,
    completed_at: null,
    tags: [],
    metadata: null,
    sort_order: 10,
    last_interacted_at: "2026-09-17T08:00:00.000Z",
    created_at: "2026-09-17T08:00:00.000Z",
    updated_at: "2026-09-17T08:00:00.000Z",
    ...overrides,
  };
}

describe("date board filters", () => {
  const now = Date.parse("2026-09-17T12:00:00.000Z");
  const today = new Date(now);

  it("classifies today, tomorrow, overdue, and undated items", () => {
    const dueToday = item({ due_date: "2026-09-17T18:00:00.000Z" });
    const dueTomorrow = item({ due_date: "2026-09-18T09:00:00.000Z" });
    const overdue = item({ due_date: "2026-09-16T09:00:00.000Z" });
    const undated = item({ due_date: null });

    assert.equal(isItemDueToday(dueToday, today), true);
    assert.equal(isItemDueToday(overdue, today), false);
    assert.equal(isItemDueTomorrow(dueTomorrow, today), true);
    assert.equal(isItemDueTomorrow(dueToday, today), false);
    assert.equal(isItemOverdue(overdue, now), true);
    assert.equal(isItemOverdue(dueToday, now), false);
    assert.equal(isItemUndated(undated), true);
    assert.equal(isItemUndated(dueToday), false);
  });

  it("filters a mixed list by date scope", () => {
    const items = [
      item({ id: "today", due_date: "2026-09-17T18:00:00.000Z" }),
      item({ id: "tomorrow", due_date: "2026-09-18T09:00:00.000Z" }),
      item({ id: "past", due_date: "2026-09-10T09:00:00.000Z" }),
      item({ id: "none", due_date: null }),
    ];

    assert.deepEqual(
      applyBoardItemFilters(items, null, false, "overdue", now).map((entry) => entry.id),
      ["past"],
    );
    assert.deepEqual(
      applyBoardItemFilters(items, null, false, "undated", now).map((entry) => entry.id),
      ["none"],
    );
    assert.deepEqual(
      applyBoardItemFilters(items, null, false, "today", now).map((entry) => entry.id),
      ["today"],
    );
    assert.deepEqual(
      applyBoardItemFilters(items, null, false, "tomorrow", now).map((entry) => entry.id),
      ["tomorrow"],
    );
  });

  it("does not treat recurring tasks with a stale due date as overdue", () => {
    const daily = item({
      id: "daily",
      due_date: "2026-09-16T09:00:00+03:00",
      metadata: { reminder_recurrence: "daily" },
    });
    const weekly = item({
      id: "weekly",
      due_date: "2026-09-10T09:00:00+03:00",
      metadata: { reminder_recurrence: "weekly" },
    });
    const oneShot = item({
      id: "past",
      due_date: "2026-09-10T09:00:00+03:00",
    });

    assert.equal(isItemOverdue(daily, now), false);
    assert.equal(isItemOverdue(weekly, now), false);
    assert.equal(isItemOverdue(oneShot, now), true);
    assert.equal(isItemDueToday(daily, today), true);
    assert.equal(isItemDueToday(weekly, today), true);

    assert.deepEqual(
      applyBoardItemFilters([daily, weekly, oneShot], null, false, "overdue", now).map(
        (entry) => entry.id,
      ),
      ["past"],
    );
    assert.deepEqual(
      applyBoardItemFilters([daily, weekly, oneShot], null, false, "today", now).map(
        (entry) => entry.id,
      ),
      ["daily", "weekly"],
    );
  });

  it("treats boolean todayOnly as the today date filter", () => {
    const items = [
      item({ id: "today", due_date: "2026-09-17T18:00:00.000Z" }),
      item({ id: "none", due_date: null }),
    ];
    const filtered = applyBoardItemFilters(items, null, false, true, now);
    assert.deepEqual(filtered.map((entry) => entry.id), ["today"]);
  });
});

describe("boardFiltersActive", () => {
  it("is active for date chips, tags, and priority", () => {
    assert.equal(boardFiltersActive({ dateFilter: "all" }), false);
    assert.equal(boardFiltersActive({ dateFilter: "overdue" as BoardDateFilter }), true);
    assert.equal(boardFiltersActive({ dateFilter: "tomorrow" as BoardDateFilter }), true);
    assert.equal(boardFiltersActive({ tag: "בית" }), true);
    assert.equal(boardFiltersActive({ priorityOnly: true }), true);
    assert.equal(boardFiltersActive({ query: "  " }), false);
  });
});
