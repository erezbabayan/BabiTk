import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceReminderDueDate,
  buildAfterReminderSentPatch,
  buildClearReminderPatch,
  buildInferredReminderPatch,
  buildManualReminderPatch,
  getReminderRecurrence,
  nextActiveDueDate,
} from "../../../convex/lib/resolveItemReminder.js";
import * as backendCopy from "../lib/reminderRecurrence.js";

const TZ = "Asia/Jerusalem";

describe("backend reminder recurrence copy stays in sync with convex", () => {
  const recurrences = ["daily", "weekly", "monthly", "weekdays"] as const;
  const from = "2026-07-16T09:00:00+03:00";

  it("advances every recurrence identically", () => {
    for (const recurrence of recurrences) {
      assert.equal(
        backendCopy.advanceReminderDueDate(from, recurrence, TZ),
        advanceReminderDueDate(from, recurrence, TZ),
        `recurrence ${recurrence} drifted`,
      );
    }
  });

  it("builds the same after-sent patch", () => {
    const item = {
      due_date: from,
      metadata: {
        reminder_recurrence: "daily",
        reminder_manual: true,
        analysis: { notify_at: from },
      },
    };
    assert.deepEqual(
      backendCopy.buildAfterReminderSentPatch(item, { timezone: TZ, firedAt: from }),
      buildAfterReminderSentPatch(item, { timezone: TZ, firedAt: from }),
    );
    assert.deepEqual(
      backendCopy.buildAfterReminderSentPatch({ due_date: from, metadata: {} }),
      buildAfterReminderSentPatch({ due_date: from, metadata: {} }),
    );
  });

  it("rolls nextActiveDueDate identically", () => {
    const item = {
      due_date: "2026-09-10T09:00:00+03:00",
      metadata: { reminder_recurrence: "weekly" as const },
    };
    const now = new Date("2026-09-17T12:00:00+03:00");
    assert.equal(
      backendCopy.nextActiveDueDate(item, now, TZ),
      nextActiveDueDate(item, now, TZ),
    );
  });
});

describe("reminder recurrence", () => {
  it("advances daily / weekly / monthly keeping local time", () => {
    const from = "2026-07-13T09:00:00+03:00";
    assert.equal(advanceReminderDueDate(from, "daily", TZ), "2026-07-14T09:00:00+03:00");
    assert.equal(advanceReminderDueDate(from, "weekly", TZ), "2026-07-20T09:00:00+03:00");
    assert.equal(advanceReminderDueDate(from, "monthly", TZ), "2026-08-13T09:00:00+03:00");
  });

  it("advances weekdays across the Israeli weekend", () => {
    // Thursday → next weekday is Sunday
    const thursday = "2026-07-16T09:00:00+03:00";
    assert.equal(
      advanceReminderDueDate(thursday, "weekdays", TZ),
      "2026-07-19T09:00:00+03:00",
    );
  });

  it("stores recurrence on manual reminder and clears reminder_sent", () => {
    const patch = buildManualReminderPatch(
      {
        title: "משימה",
        content: "",
        due_date: null,
        metadata: { reminder_sent: true },
        is_actionable: true,
      },
      "2026-07-14T09:00:00+03:00",
      "weekly",
    );
    assert.equal(getReminderRecurrence(patch.metadata), "weekly");
    assert.equal(patch.metadata.reminder_sent, false);
    assert.equal(patch.metadata.reminder_manual, true);
    const analysis = patch.metadata.analysis as Record<string, unknown>;
    assert.equal(analysis.notify_at, patch.due_date);
  });

  it("clears recurrence when reminder is cancelled", () => {
    const patch = buildClearReminderPatch({
      title: "משימה",
      content: "",
      due_date: "2026-07-14T09:00:00+03:00",
      metadata: { reminder_recurrence: "daily", reminder_manual: true },
      is_actionable: true,
    });
    assert.equal(getReminderRecurrence(patch.metadata), null);
    assert.equal(patch.due_date, null);
  });

  it("advances due date after a recurring reminder is sent", () => {
    const after = buildAfterReminderSentPatch(
      {
        due_date: "2026-07-13T09:00:00+03:00",
        metadata: {
          reminder_recurrence: "daily",
          reminder_manual: true,
          analysis: { notify_at: "2026-07-13T09:00:00+03:00" },
        },
      },
      { timezone: TZ, firedAt: "2026-07-13T09:00:00+03:00" },
    );
    assert.equal(after.due_date, "2026-07-14T09:00:00+03:00");
    assert.equal(after.metadata.reminder_sent, false);
    assert.equal(getReminderRecurrence(after.metadata), "daily");
  });

  it("marks one-shot reminders as sent", () => {
    const after = buildAfterReminderSentPatch({
      due_date: "2026-07-13T09:00:00+03:00",
      metadata: { reminder_manual: true },
    });
    assert.equal(after.due_date, undefined);
    assert.equal(after.metadata.reminder_sent, true);
  });

  it("syncs notify_at when a task due date is inferred", () => {
    const patch = buildInferredReminderPatch({
      title: "לקנות חלב",
      content: "",
      due_date: "2026-07-13T09:00:00+03:00",
      is_actionable: true,
    });
    const analysis = patch.metadata.analysis as Record<string, unknown>;
    assert.equal(patch.due_date, "2026-07-13T09:00:00+03:00");
    assert.equal(analysis.notify_at, patch.due_date);
  });
});

describe("nextActiveDueDate", () => {
  const now = new Date("2026-09-17T12:00:00+03:00");

  it("returns the stored date when the item is not recurring", () => {
    assert.equal(
      nextActiveDueDate({ due_date: "2026-09-10T09:00:00+03:00" }, now, TZ),
      "2026-09-10T09:00:00+03:00",
    );
  });

  it("keeps a daily task from yesterday on today even after the clock time", () => {
    assert.equal(
      nextActiveDueDate(
        {
          due_date: "2026-09-16T09:00:00+03:00",
          metadata: { reminder_recurrence: "daily" },
        },
        now,
        TZ,
      ),
      "2026-09-17T09:00:00+03:00",
    );
  });

  it("rolls a weekly task from last Monday to next Monday, not overdue", () => {
    // 2026-09-10 is Thursday last week; +7 until >= 2026-09-17 Thursday → today
    assert.equal(
      nextActiveDueDate(
        {
          due_date: "2026-09-10T09:00:00+03:00",
          metadata: { reminder_recurrence: "weekly" },
        },
        now,
        TZ,
      ),
      "2026-09-17T09:00:00+03:00",
    );
    assert.equal(
      nextActiveDueDate(
        {
          due_date: "2026-09-14T09:00:00+03:00",
          metadata: { reminder_recurrence: "weekly" },
        },
        now,
        TZ,
      ),
      "2026-09-21T09:00:00+03:00",
    );
  });

  it("returns null without a due date", () => {
    assert.equal(
      nextActiveDueDate({ due_date: null, metadata: { reminder_recurrence: "daily" } }, now, TZ),
      null,
    );
  });
});
