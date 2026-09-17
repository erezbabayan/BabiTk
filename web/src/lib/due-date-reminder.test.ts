import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatReminderAlertBody,
  isItemDueForReminder,
  nextUpcomingReminderDelayMs,
  reminderAlertId,
  resolveItemReminderFireAt,
  type ReminderSourceItem,
} from "./due-date-reminder.js";

function item(overrides: Partial<ReminderSourceItem> = {}): ReminderSourceItem {
  return {
    id: "task-1",
    title: "להתקשר ללקוח",
    is_actionable: true,
    status: "pending",
    due_date: "2026-09-16T12:00:00.000Z",
    metadata: null,
    ...overrides,
  };
}

describe("resolveItemReminderFireAt", () => {
  it("fires a task at its due date", () => {
    assert.equal(resolveItemReminderFireAt(item()), "2026-09-16T12:00:00.000Z");
  });

  it("prefers analysis.notify_at when present", () => {
    assert.equal(
      resolveItemReminderFireAt(
        item({
          metadata: { analysis: { notify_at: "2026-09-16T11:30:00.000Z" } },
        }),
      ),
      "2026-09-16T11:30:00.000Z",
    );
  });

  it("skips completed, cancelled, and already-sent reminders", () => {
    assert.equal(resolveItemReminderFireAt(item({ status: "completed" })), null);
    assert.equal(
      resolveItemReminderFireAt(item({ metadata: { reminder_disabled: true } })),
      null,
    );
    assert.equal(
      resolveItemReminderFireAt(item({ metadata: { reminder_sent: true } })),
      null,
    );
  });

  it("notes fire when they have a due date, even without reminder_manual", () => {
    assert.equal(
      resolveItemReminderFireAt(item({ is_actionable: false, due_date: null })),
      null,
    );
    assert.equal(
      resolveItemReminderFireAt(item({ is_actionable: false })),
      "2026-09-16T12:00:00.000Z",
    );
  });
});

describe("isItemDueForReminder", () => {
  it("is due at or after the fire time, but not days later", () => {
    const due = item({ due_date: "2026-09-16T12:00:00.000Z" });
    const atDue = Date.parse("2026-09-16T12:00:00.000Z");
    assert.equal(isItemDueForReminder(due, atDue - 1), false);
    assert.equal(isItemDueForReminder(due, atDue), true);
    assert.equal(isItemDueForReminder(due, atDue + 60_000), true);
    assert.equal(isItemDueForReminder(due, atDue + 25 * 60 * 60 * 1000), false);
  });
});

describe("nextUpcomingReminderDelayMs", () => {
  it("returns the soonest future task due date", () => {
    const now = Date.parse("2026-09-16T11:00:00.000Z");
    const delay = nextUpcomingReminderDelayMs(
      [
        item({ id: "later", due_date: "2026-09-16T13:00:00.000Z" }),
        item({ id: "soon", due_date: "2026-09-16T11:10:00.000Z" }),
      ],
      now,
    );
    assert.equal(delay, 10 * 60 * 1000);
  });
});

describe("reminder alert copy", () => {
  it("builds a stable id and Hebrew body", () => {
    const due = item();
    assert.equal(
      reminderAlertId(due.id, due.due_date!),
      "due:task-1:2026-09-16T12:00:00.000Z",
    );
    assert.match(formatReminderAlertBody(due, due.due_date!), /מועד המשימה/);
  });
});
