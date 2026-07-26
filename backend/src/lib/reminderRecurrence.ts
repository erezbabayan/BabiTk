/**
 * Recurring-reminder advance logic for the cron worker.
 * Keep in sync with convex/lib/resolveItemReminder.ts
 *
 * The backend keeps its own copy because it builds standalone (Dockerfile only
 * copies backend/src), so it cannot import from the repo-root convex/ folder.
 */
import {
  addZonedDays,
  addZonedMonths,
  getZonedParts,
} from "../utils/timezone.js";

const DEFAULT_TIMEZONE = "Asia/Jerusalem";

export type ReminderRecurrence = "daily" | "weekly" | "monthly" | "weekdays";

export function getReminderRecurrence(
  metadata: unknown,
): ReminderRecurrence | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).reminder_recurrence;
  if (
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "weekdays"
  ) {
    return value;
  }
  return null;
}

export function patchReminderMetadata(
  metadata: unknown,
  patch: Partial<{
    manual: boolean;
    disabled: boolean;
    sent: boolean;
    recurrence: ReminderRecurrence | null;
  }>,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object"
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  if (patch.manual !== undefined) base.reminder_manual = patch.manual;
  if (patch.disabled !== undefined) base.reminder_disabled = patch.disabled;
  if (patch.sent !== undefined) base.reminder_sent = patch.sent;
  if (patch.recurrence !== undefined) {
    if (patch.recurrence === null) {
      delete base.reminder_recurrence;
    } else {
      base.reminder_recurrence = patch.recurrence;
    }
  }
  return base;
}

function syncAnalysisFireTimes(
  metadata: Record<string, unknown>,
  dueDate: string | null,
): Record<string, unknown> {
  const analysisRaw = metadata.analysis;
  const analysis =
    analysisRaw && typeof analysisRaw === "object"
      ? { ...(analysisRaw as Record<string, unknown>) }
      : {};
  analysis.target_at = dueDate;
  analysis.notify_at = dueDate;
  return { ...metadata, analysis };
}

function addDaysKeepingTime(
  timeZone: string,
  fromIso: string,
  days: number,
): string {
  const from = new Date(fromIso);
  const parts = getZonedParts(from, timeZone);
  return addZonedDays(timeZone, from, days, parts.hour, parts.minute);
}

/** Israeli work week: Sunday–Thursday. */
function isIsraeliWeekday(weekday: number): boolean {
  return weekday >= 0 && weekday <= 4;
}

function nextWeekdayOccurrence(timeZone: string, fromIso: string): string {
  let candidate = addDaysKeepingTime(timeZone, fromIso, 1);
  for (let i = 0; i < 8; i++) {
    const weekday = getZonedParts(new Date(candidate), timeZone).weekday;
    if (isIsraeliWeekday(weekday)) return candidate;
    candidate = addDaysKeepingTime(timeZone, candidate, 1);
  }
  return candidate;
}

/** Compute the next fire time after `fromIso` for a recurrence rule. */
export function advanceReminderDueDate(
  fromIso: string,
  recurrence: ReminderRecurrence,
  timezone = DEFAULT_TIMEZONE,
): string {
  switch (recurrence) {
    case "daily":
      return addDaysKeepingTime(timezone, fromIso, 1);
    case "weekly":
      return addDaysKeepingTime(timezone, fromIso, 7);
    case "monthly": {
      const from = new Date(fromIso);
      const parts = getZonedParts(from, timezone);
      return addZonedMonths(timezone, from, 1, parts.hour, parts.minute);
    }
    case "weekdays":
      return nextWeekdayOccurrence(timezone, fromIso);
  }
}

/**
 * Patch to apply once a reminder fired: mark one-shot reminders as sent, or
 * roll a recurring reminder forward to its next occurrence.
 */
export function buildAfterReminderSentPatch(
  item: { due_date?: string | null; metadata?: unknown },
  options?: { timezone?: string; firedAt?: string },
): { due_date?: string | null; metadata: Record<string, unknown> } {
  const timezone = options?.timezone ?? DEFAULT_TIMEZONE;
  const recurrence = getReminderRecurrence(item.metadata);
  const fromIso =
    (typeof item.due_date === "string" && item.due_date) ||
    options?.firedAt ||
    null;

  if (!recurrence || !fromIso) {
    return { metadata: patchReminderMetadata(item.metadata, { sent: true }) };
  }

  const nextDue = advanceReminderDueDate(fromIso, recurrence, timezone);
  let metadata = patchReminderMetadata(item.metadata, {
    sent: false,
    manual: true,
    disabled: false,
    recurrence,
  });
  metadata = syncAnalysisFireTimes(metadata, nextDue);
  return { due_date: nextDue, metadata };
}
