import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  advanceReminderDueDate,
  alertSnoozeDueAt,
  buildAfterReminderSentPatch,
  buildClearReminderPatch,
  buildInferredReminderPatch,
  buildManualReminderPatch,
  defaultTomorrowReminderIso,
  snoozePresetIsos,
  getReminderRecurrence,
  listReminderOccurrencesInRange,
  nextActiveDueDate,
  previousReminderDueDate,
} from "../../../convex/lib/resolveItemReminder.js";
import { getZonedParts } from "../../../convex/lib/ingest/timezone.js";
import * as backendCopy from "../lib/reminderRecurrence.js";
import {
  postponeOriginalDueByDays as postponeEdge,
  reminderMetadataForNewDue as edgeReminderMetadata,
} from "../../../supabase/functions/_shared/zoned-time.ts";

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
      assert.equal(
        backendCopy.previousReminderDueDate(from, recurrence, TZ),
        previousReminderDueDate(from, recurrence, TZ),
        `previous ${recurrence} drifted`,
      );
    }
  });

  it("lists occurrences in a range identically", () => {
    assert.deepEqual(
      backendCopy.listReminderOccurrencesInRange(
        from,
        "daily",
        "2026-07-14",
        "2026-07-16",
        TZ,
      ),
      listReminderOccurrencesInRange(from, "daily", "2026-07-14", "2026-07-16", TZ),
    );
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
    assert.equal(
      previousReminderDueDate("2026-07-19T09:00:00+03:00", "weekdays", TZ),
      thursday,
    );
  });

  it("walks daily and weekly backward keeping local time", () => {
    const from = "2026-07-13T09:00:00+03:00";
    assert.equal(previousReminderDueDate(from, "daily", TZ), "2026-07-12T09:00:00+03:00");
    assert.equal(previousReminderDueDate(from, "weekly", TZ), "2026-07-06T09:00:00+03:00");
    assert.equal(previousReminderDueDate(from, "monthly", TZ), "2026-06-13T09:00:00+03:00");
  });

  it("fills every matching day in a month for a rolled-forward daily task", () => {
    const days = listReminderOccurrencesInRange(
      "2026-10-16T09:00:00+03:00",
      "daily",
      "2026-10-01",
      "2026-10-31",
      TZ,
    );
    assert.equal(days.length, 31);
    assert.equal(days[0], "2026-10-01T09:00:00+03:00");
    assert.equal(days[30], "2026-10-31T09:00:00+02:00");
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

  it("jumps a stale daily series to today without hundreds of steps", () => {
    assert.equal(
      nextActiveDueDate(
        {
          due_date: "2026-01-02T09:00:00+02:00",
          metadata: { reminder_recurrence: "daily" },
        },
        now,
        TZ,
      ),
      "2026-09-17T09:00:00+03:00",
    );
  });
});

describe("alert snooze from reminder popup", () => {
  it("postpones one hour in Asia/Jerusalem", () => {
    const now = new Date("2026-10-19T22:15:00+03:00");
    assert.equal(alertSnoozeDueAt("hour", now, TZ), "2026-10-19T23:15:00+03:00");
  });

  it("postpones to tomorrow morning at 09:00", () => {
    const now = new Date("2026-10-19T22:15:00+03:00");
    assert.equal(alertSnoozeDueAt("tomorrow", now, TZ), "2026-10-20T09:00:00+03:00");
    assert.equal(
      alertSnoozeDueAt("tomorrow", now, TZ),
      defaultTomorrowReminderIso(TZ, now),
    );
  });

  it("board chips use 09:00 Asia/Jerusalem, not the device clock", () => {
    const now = new Date("2026-06-18T22:30:00.000Z");
    const presets = snoozePresetIsos(now, TZ);
    const morning = getZonedParts(new Date(presets.tomorrowMorning), TZ);
    assert.equal(morning.year, 2026);
    assert.equal(morning.month, 6);
    assert.equal(morning.day, 20);
    assert.equal(morning.hour, 9);
    assert.equal(morning.minute, 0);
    const week = getZonedParts(new Date(presets.nextWeek), TZ);
    assert.equal(week.day, 26);
    assert.equal(week.hour, 9);
  });

  it("moves the original due seven local days ahead, not from now", () => {
    const now = new Date("2026-10-24T08:00:00+03:00");
    const original = "2026-10-19T22:15:00+03:00";
    const due = alertSnoozeDueAt("week", now, TZ, original);
    const parts = getZonedParts(new Date(due), TZ);
    assert.equal(parts.year, 2026);
    assert.equal(parts.month, 10);
    assert.equal(parts.day, 26);
    assert.equal(parts.hour, 22);
    assert.equal(parts.minute, 15);
    assert.equal(backendCopy.postponeOriginalDueByDays(original, 7, TZ, now), due);
    assert.equal(postponeEdge(original, 7, TZ, now), due);
  });

  it("keeps the clock across the Israel DST change", () => {
    const now = new Date("2026-10-24T08:00:00+03:00");
    const autumn = alertSnoozeDueAt("week", now, TZ, "2026-10-23T15:00:00+03:00");
    const autumnParts = getZonedParts(new Date(autumn), TZ);
    assert.equal(autumnParts.month, 10);
    assert.equal(autumnParts.day, 30);
    assert.equal(autumnParts.hour, 15);
    assert.equal(autumnParts.minute, 0);
    const spring = backendCopy.postponeOriginalDueByDays(
      "2026-03-26T10:30:00+02:00",
      7,
      TZ,
      new Date("2026-03-27T12:00:00+03:00"),
    );
    const springParts = getZonedParts(new Date(spring), TZ);
    assert.equal(springParts.month, 4);
    assert.equal(springParts.day, 2);
    assert.equal(springParts.hour, 10);
    assert.equal(springParts.minute, 30);
    assert.equal(
      postponeEdge("2026-03-26T10:30:00+02:00", 7, TZ, new Date("2026-03-27T12:00:00+03:00")),
      spring,
    );
  });

  it("uses the current clock when the original due is missing", () => {
    const now = new Date("2026-10-19T22:15:00+03:00");
    const due = alertSnoozeDueAt("week", now, TZ, null);
    const parts = getZonedParts(new Date(due), TZ);
    assert.equal(parts.day, 26);
    assert.equal(parts.hour, 22);
    assert.equal(parts.minute, 15);
  });

  it("clears reminder_sent and keeps the new notify time", () => {
    const due = "2026-10-26T22:15:00+02:00";
    const metadata = backendCopy.reminderMetadataForNewDue(
      { reminder_sent: true, note: "keep", analysis: { priority: "high" } },
      due,
    );
    assert.equal(metadata.reminder_sent, false);
    assert.equal(metadata.reminder_manual, true);
    assert.equal(metadata.reminder_disabled, false);
    assert.equal(metadata.note, "keep");
    const analysis = metadata.analysis as { notify_at: string; target_at: string; priority: string };
    assert.equal(analysis.notify_at, due);
    assert.equal(analysis.target_at, due);
    assert.equal(analysis.priority, "high");
    assert.deepEqual(
      edgeReminderMetadata(
        { reminder_sent: true, note: "keep", analysis: { priority: "high" } },
        due,
      ),
      metadata,
    );
  });

  it("shows דחה לשבוע הבא beside the existing snooze controls", () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const files = [
      "web/src/components/ReminderAlertModal.tsx",
      "mobile/src/components/ReminderAlertModal.tsx",
      "web/src/components/ReminderPicker.tsx",
      "web/src/components/ListReminderPicker.tsx",
      "mobile/src/components/ActionSheets.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(path.join(root, file), "utf8");
      assert.match(source, /דחה לשבוע הבא/);
      assert.match(source, /שבוע הבא|מחר ב-09:00|tomorrow/);
    }
  });

  it("clears reminder_sent so the snoozed time can fire again", () => {
    const now = new Date("2026-10-19T08:00:00+03:00");
    const due = alertSnoozeDueAt("hour", now, TZ);
    const patch = buildManualReminderPatch(
      {
        title: "תזכורת",
        content: "",
        due_date: "2026-10-19T07:00:00+03:00",
        metadata: { reminder_sent: true },
        is_actionable: true,
      },
      due,
    );
    assert.equal(patch.due_date, due);
    assert.equal(patch.metadata.reminder_sent, false);
  });
});
