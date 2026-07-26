import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceReminderDueDate,
  buildAfterReminderSentPatch,
  buildClearReminderPatch,
  buildManualReminderPatch,
  getReminderRecurrence,
} from "../../../convex/lib/resolveItemReminder.js";

const TZ = "Asia/Jerusalem";

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
});
