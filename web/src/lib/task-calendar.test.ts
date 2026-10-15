import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MindtaskerItem } from "../types.ts";
import {
  addDaysYmd,
  calendarTasks,
  groupCalendarTasksByDay,
  hebrewMonthTitle,
  monthGrid,
  shiftMonth,
  taskCalendarDayKey,
} from "./task-calendar.ts";

function item(overrides: Partial<MindtaskerItem> = {}): MindtaskerItem {
  return {
    id: overrides.id ?? "1",
    user_id: "user",
    source_material_id: null,
    title: overrides.title ?? "משימה",
    content: "",
    is_actionable: true,
    status: "pending",
    due_date: "2026-10-15T07:00:00.000Z",
    completed_at: null,
    tags: [],
    metadata: null,
    sort_order: 10,
    last_interacted_at: "2026-10-15T08:00:00.000Z",
    created_at: "2026-10-15T08:00:00.000Z",
    updated_at: "2026-10-15T08:00:00.000Z",
    ...overrides,
  };
}

describe("BabiTk task calendar", () => {
  it("builds a Sunday-first October 2026 grid", () => {
    const cells = monthGrid(2026, 10);
    assert.equal(cells.length, 42);
    assert.equal(cells[0]?.ymd, "2026-09-27");
    assert.equal(cells[4]?.ymd, "2026-10-01");
    assert.equal(cells[4]?.inMonth, true);
    assert.equal(cells[0]?.inMonth, false);
    assert.equal(hebrewMonthTitle(2026, 10), "אוקטובר 2026");
  });

  it("groups dated tasks by Jerusalem day and skips notes, completed, and undated", () => {
    const tasks = calendarTasks([
      item({ id: "keep", title: "פגישה", due_date: "2026-10-15T07:00:00.000Z" }),
      item({ id: "note", is_actionable: false, due_date: "2026-10-15T07:00:00.000Z" }),
      item({ id: "done", status: "completed", completed_at: "2026-10-15T08:00:00.000Z" }),
      item({ id: "none", due_date: null }),
    ]);
    assert.deepEqual(
      tasks.map((entry) => entry.id),
      ["keep"],
    );
    const grouped = groupCalendarTasksByDay(tasks);
    assert.equal(grouped.get("2026-10-15")?.[0]?.title, "פגישה");
  });

  it("keys due dates in Asia/Jerusalem", () => {
    assert.equal(taskCalendarDayKey("2026-10-14T22:00:00.000Z"), "2026-10-15");
    assert.equal(addDaysYmd("2026-10-31", 1), "2026-11-01");
    assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  });
});
