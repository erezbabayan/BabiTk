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

  it("paints recurring calendar items in a light color", () => {
    const calendar = readFileSync(join(here, "../components/TaskMonthCalendar.tsx"), "utf8");
    assert.match(calendar, /isCalendarRecurringItem/);
    assert.match(calendar, /calendarDayTaskRowClass/);
    assert.match(calendar, /calendarDayDotClass/);
    assert.match(calendar, /data-babitk-calendar-recurring/);
  });
});
