import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { resolveTaskBoardView } from "./board-item-view.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("task board view", () => {
  it("defaults to calendar when the calendar flag is on", () => {
    assert.equal(resolveTaskBoardView(true, "list"), "calendar");
    assert.equal(resolveTaskBoardView(true, "squares"), "calendar");
  });

  it("uses rows or cubes when calendar is off", () => {
    assert.equal(resolveTaskBoardView(false, "list"), "list");
    assert.equal(resolveTaskBoardView(false, "squares"), "squares");
  });

  it("swipes calendar-day tasks like the other task views", () => {
    const calendar = readFileSync(join(here, "../components/TaskMonthCalendar.tsx"), "utf8");
    const dashboard = readFileSync(join(here, "../components/Dashboard.tsx"), "utf8");
    assert.match(calendar, /boardSwipeActions/);
    assert.match(calendar, /SwipeableItemCard/);
    assert.match(calendar, /onArchive/);
    assert.match(calendar, /onDelete/);
    assert.match(dashboard, /onArchive=\{\(item\) => void archiveItem\(item\)\}/);
    assert.match(dashboard, /onDelete=\{confirmDelete\}/);
  });

  it("filters the task calendar with the same board search as the list", () => {
    const dashboard = readFileSync(join(here, "../components/Dashboard.tsx"), "utf8");
    const calendar = readFileSync(join(here, "../components/TaskMonthCalendar.tsx"), "utf8");
    assert.match(dashboard, /const calendarBoardItems[\s\S]*mergeSearchResults\(/);
    assert.match(dashboard, /todaySearchOpen \? "all"/);
    assert.match(dashboard, /searchQuery=\{todaySearch\.activeQuery\}/);
    assert.match(dashboard, /firstBusyCalendarYmd/);
    assert.match(calendar, /searchQuery/);
    assert.match(calendar, /data-babitk-calendar-search/);
    assert.match(calendar, /data-babitk-calendar-search-results/);
    assert.match(calendar, /calendarSearchHitsFromItems\(items/);
    assert.match(calendar, /searchHit: searching/);
    assert.match(calendar, /isoDateToDdMmYyyy\(group\.ymd\)/);
    assert.doesNotMatch(calendar, /ללא תאריך/);
  });

  it("paints recurring calendar items in a light color", () => {
    const calendar = readFileSync(join(here, "../components/TaskMonthCalendar.tsx"), "utf8");
    const css = readFileSync(join(here, "../index.css"), "utf8");
    assert.match(calendar, /isCalendarRecurringItem/);
    assert.match(calendar, /calendarDayTaskRowClass/);
    assert.match(calendar, /calendarDayTaskRowStyle/);
    assert.match(calendar, /calendarDayDotClass/);
    assert.match(calendar, /data-babitk-calendar-recurring/);
    assert.match(css, /\.babitk-calendar-day-task--recurring/);
    assert.match(css, /#c5f6e4/);
  });
});
