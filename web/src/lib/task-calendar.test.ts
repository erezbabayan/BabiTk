import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MindtaskerItem } from "../types.ts";
import {
  addDaysYmd,
  calendarChipFocusYmd,
  calendarDayDotClass,
  calendarDayTaskRowClass,
  calendarDayTaskRowStyle,
  calendarMonthExpandRange,
  calendarMonthFromYmd,
  calendarSwipeMonthDelta,
  calendarTasks,
  firstBusyCalendarYmd,
  groupCalendarTasksByDay,
  hebrewMonthTitle,
  isCalendarRecurringItem,
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

  it("groups dated tasks by Jerusalem day, including inbox and analysis dates", () => {
    const tasks = calendarTasks([
      item({ id: "keep", title: "פגישה", due_date: "2026-10-15T07:00:00.000Z" }),
      item({
        id: "inbox",
        title: "מהמחברת",
        status: "inbox",
        due_date: "2026-10-16T07:00:00.000Z",
      }),
      item({
        id: "analysis",
        title: "מניתוח",
        due_date: null,
        metadata: { analysis: { target_at: "2026-10-17T09:00:00.000Z" } },
      }),
      item({ id: "done", status: "completed", completed_at: "2026-10-15T08:00:00.000Z" }),
      item({ id: "none", due_date: null }),
    ]);
    assert.deepEqual(
      tasks.map((entry) => entry.id),
      ["keep", "inbox", "analysis"],
    );
    const grouped = groupCalendarTasksByDay(tasks);
    assert.equal(grouped.get("2026-10-15")?.[0]?.item.title, "פגישה");
    assert.equal(grouped.get("2026-10-16")?.[0]?.item.id, "inbox");
    assert.equal(grouped.get("2026-10-17")?.[0]?.item.id, "analysis");
  });

  it("expands a daily recurring task onto every day in the visible month", () => {
    const range = { fromYmd: "2026-10-01", toYmd: "2026-10-31" };
    const grouped = groupCalendarTasksByDay(
      [
        item({
          id: "daily",
          title: "תרופה",
          due_date: "2026-10-15T07:00:00.000Z",
          metadata: { reminder_recurrence: "daily" },
        }),
      ],
      range,
    );
    assert.equal(grouped.get("2026-10-01")?.[0]?.item.id, "daily");
    assert.equal(grouped.get("2026-10-31")?.[0]?.item.id, "daily");
    assert.equal(grouped.get("2026-09-30"), undefined);
    assert.equal(grouped.get("2026-11-01"), undefined);
    assert.equal(grouped.get("2026-10-16")?.length, 1);
  });

  it("expands weekly and Israeli weekday recurrence across the month", () => {
    const range = { fromYmd: "2026-10-01", toYmd: "2026-10-31" };
    const weekly = groupCalendarTasksByDay(
      [
        item({
          id: "weekly",
          due_date: "2026-10-15T07:00:00.000Z",
          metadata: { reminder_recurrence: "weekly" },
        }),
      ],
      range,
    );
    // 2026-10-15 is Thursday; series is every Thursday.
    assert.equal(weekly.get("2026-10-08")?.[0]?.item.id, "weekly");
    assert.equal(weekly.get("2026-10-15")?.[0]?.item.id, "weekly");
    assert.equal(weekly.get("2026-10-22")?.[0]?.item.id, "weekly");
    assert.equal(weekly.get("2026-10-16"), undefined);

    const weekdays = groupCalendarTasksByDay(
      [
        item({
          id: "weekdays",
          due_date: "2026-10-15T07:00:00.000Z",
          metadata: { reminder_recurrence: "weekdays" },
        }),
      ],
      range,
    );
    assert.equal(weekdays.get("2026-10-15")?.[0]?.item.id, "weekdays");
    assert.equal(weekdays.get("2026-10-16"), undefined);
    assert.equal(weekdays.get("2026-10-17"), undefined);
    assert.equal(weekdays.get("2026-10-18")?.[0]?.item.id, "weekdays");
    assert.equal(weekdays.get("2026-10-19")?.[0]?.item.id, "weekdays");
  });

  it("expands a monthly task onto the matching day of nearby months", () => {
    const october = groupCalendarTasksByDay(
      [
        item({
          id: "monthly",
          due_date: "2026-10-15T07:00:00.000Z",
          metadata: { reminder_recurrence: "monthly" },
        }),
      ],
      calendarMonthExpandRange(2026, 10),
    );
    assert.equal(october.get("2026-10-15")?.[0]?.item.id, "monthly");
    assert.equal(october.get("2026-10-16"), undefined);
    const november = groupCalendarTasksByDay(
      [
        item({
          id: "monthly",
          due_date: "2026-10-15T07:00:00.000Z",
          metadata: { reminder_recurrence: "monthly" },
        }),
      ],
      calendarMonthExpandRange(2026, 11),
    );
    assert.equal(november.get("2026-11-15")?.[0]?.item.id, "monthly");
  });

  it("keys due dates in Asia/Jerusalem", () => {
    assert.equal(taskCalendarDayKey("2026-10-14T22:00:00.000Z"), "2026-10-15");
    assert.equal(addDaysYmd("2026-10-31", 1), "2026-11-01");
    assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  });

  it("maps today/tomorrow chips to the Jerusalem day to open", () => {
    const morning = new Date("2026-10-15T07:00:00.000Z");
    assert.equal(calendarChipFocusYmd("today", morning), "2026-10-15");
    assert.equal(calendarChipFocusYmd("tomorrow", morning), "2026-10-16");
    assert.equal(calendarChipFocusYmd("overdue", morning), null);
    assert.equal(calendarChipFocusYmd("all", morning), null);
    assert.deepEqual(calendarMonthFromYmd("2026-11-01"), { year: 2026, month: 11 });
    const monthEnd = new Date("2026-10-31T10:00:00.000Z");
    assert.equal(calendarChipFocusYmd("tomorrow", monthEnd), "2026-11-01");
  });

  it("pads month expand range with the previous and next months", () => {
    assert.deepEqual(calendarMonthExpandRange(2026, 10), {
      fromYmd: "2026-09-01",
      toYmd: "2026-11-30",
    });
  });

  it("maps a horizontal swipe to previous or next month", () => {
    assert.equal(calendarSwipeMonthDelta(80), 1);
    assert.equal(calendarSwipeMonthDelta(-80), -1);
    assert.equal(calendarSwipeMonthDelta(10), 0);
    assert.equal(calendarSwipeMonthDelta(Number.NaN), 0);
  });

  it("picks the first busy calendar day on or after today for search jumps", () => {
    const around = "2026-10-15";
    assert.equal(
      firstBusyCalendarYmd(
        [
          item({
            id: "later",
            title: "פגישה",
            due_date: "2026-10-20T07:00:00.000Z",
          }),
          item({
            id: "past",
            title: "עבר",
            due_date: "2026-10-01T07:00:00.000Z",
          }),
        ],
        around,
      ),
      "2026-10-20",
    );
    assert.equal(
      firstBusyCalendarYmd(
        [item({ id: "none", title: "בלי תאריך", due_date: null })],
        around,
      ),
      null,
    );
  });

  it("uses a light mint tone for recurring calendar items", () => {
    assert.equal(isCalendarRecurringItem(item()), false);
    assert.equal(
      isCalendarRecurringItem(item({ metadata: { reminder_recurrence: "daily" } })),
      true,
    );
    assert.equal(
      isCalendarRecurringItem(item({ metadata: { reminder_recurrence: "weekly" } })),
      true,
    );
    assert.equal(
      isCalendarRecurringItem(
        item({ metadata: '{"reminder_recurrence":"monthly"}' as unknown as MindtaskerItem["metadata"] }),
      ),
      true,
    );
    const once = calendarDayTaskRowClass(false);
    const repeating = calendarDayTaskRowClass(true);
    assert.match(once, /bg-white/);
    assert.doesNotMatch(once, /babitk-calendar-day-task--recurring/);
    assert.match(repeating, /babitk-calendar-day-task--recurring/);
    assert.match(repeating, /bg-teal-100/);
    assert.equal(calendarDayTaskRowStyle(false), undefined);
    assert.equal(calendarDayTaskRowStyle(true)?.backgroundColor, "#c5f6e4");
    assert.match(calendarDayDotClass(true), /bg-teal-400/);
    assert.match(calendarDayDotClass(false), /bg-blue-500/);
  });
});
