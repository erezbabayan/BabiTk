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

function previousWeekdayOccurrence(timeZone: string, fromIso: string): string {
  let candidate = addDaysKeepingTime(timeZone, fromIso, -1);
  for (let i = 0; i < 8; i++) {
    const weekday = getZonedParts(new Date(candidate), timeZone).weekday;
    if (isIsraeliWeekday(weekday)) return candidate;
    candidate = addDaysKeepingTime(timeZone, candidate, -1);
  }
  return candidate;
}

function addMonthsKeepingTime(
  timeZone: string,
  fromIso: string,
  months: number,
): string {
  const from = new Date(fromIso);
  const parts = getZonedParts(from, timeZone);
  return addZonedMonths(timeZone, from, months, parts.hour, parts.minute);
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
    case "monthly":
      return addMonthsKeepingTime(timezone, fromIso, 1);
    case "weekdays":
      return nextWeekdayOccurrence(timezone, fromIso);
  }
}

/** Compute the previous fire time before `fromIso` for a recurrence rule. */
export function previousReminderDueDate(
  fromIso: string,
  recurrence: ReminderRecurrence,
  timezone = DEFAULT_TIMEZONE,
): string {
  switch (recurrence) {
    case "daily":
      return addDaysKeepingTime(timezone, fromIso, -1);
    case "weekly":
      return addDaysKeepingTime(timezone, fromIso, -7);
    case "monthly":
      return addMonthsKeepingTime(timezone, fromIso, -1);
    case "weekdays":
      return previousWeekdayOccurrence(timezone, fromIso);
  }
}

const MAX_ACTIVE_DUE_STEPS = 400;
const MAX_CALENDAR_OCCURRENCE_STEPS = 2500;

function zonedDateKey(date: Date, timezone: string): string {
  const parts = getZonedParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function ymdDiffDays(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T12:00:00Z`);
  const to = Date.parse(`${toYmd}T12:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/** Jump close to today so the roll loop does a few steps, not hundreds. */
function skipTowardActiveDueDate(
  dueDate: string,
  recurrence: ReminderRecurrence,
  todayKey: string,
  timezone: string,
): string {
  const dueKey = zonedDateKey(new Date(dueDate), timezone);
  if (dueKey >= todayKey) return dueDate;
  const daysBehind = ymdDiffDays(dueKey, todayKey);
  if (daysBehind <= 0) return dueDate;
  switch (recurrence) {
    case "daily":
      return addDaysKeepingTime(timezone, dueDate, daysBehind);
    case "weekly":
      return addDaysKeepingTime(timezone, dueDate, Math.ceil(daysBehind / 7) * 7);
    case "weekdays":
      return addDaysKeepingTime(timezone, dueDate, Math.max(0, daysBehind - 6));
    case "monthly":
      return dueDate;
  }
}

/**
 * Next occurrence that is still active. Keep in sync with
 * convex/lib/resolveItemReminder.ts `nextActiveDueDate`.
 */
export function nextActiveDueDate(
  item: {
    due_date?: string | null;
    metadata?: unknown;
    recurrence?: ReminderRecurrence | null;
  },
  now: Date | number = new Date(),
  timezone = DEFAULT_TIMEZONE,
): string | null {
  const dueDate =
    typeof item.due_date === "string" && item.due_date.length > 0
      ? item.due_date
      : null;
  if (!dueDate) return null;
  if (!Number.isFinite(Date.parse(dueDate))) return null;

  const recurrence = item.recurrence ?? getReminderRecurrence(item.metadata);
  if (!recurrence) return dueDate;

  const nowDate = now instanceof Date ? now : new Date(now);
  const todayKey = zonedDateKey(nowDate, timezone);

  let candidate = skipTowardActiveDueDate(dueDate, recurrence, todayKey, timezone);
  for (let step = 0; step < MAX_ACTIVE_DUE_STEPS; step++) {
    const candidateMs = Date.parse(candidate);
    if (!Number.isFinite(candidateMs)) return dueDate;
    if (zonedDateKey(new Date(candidateMs), timezone) >= todayKey) {
      return candidate;
    }
    const next = advanceReminderDueDate(candidate, recurrence, timezone);
    if (next === candidate) return candidate;
    candidate = next;
  }
  return candidate;
}

/**
 * Every occurrence in `[fromYmd, toYmd]`. Keep in sync with
 * convex/lib/resolveItemReminder.ts `listReminderOccurrencesInRange`.
 */
export function listReminderOccurrencesInRange(
  seedIso: string,
  recurrence: ReminderRecurrence | null | undefined,
  fromYmd: string,
  toYmd: string,
  timezone = DEFAULT_TIMEZONE,
): string[] {
  if (!Number.isFinite(Date.parse(seedIso))) return [];
  if (fromYmd > toYmd) return [];

  if (!recurrence) {
    const key = zonedDateKey(new Date(seedIso), timezone);
    return key >= fromYmd && key <= toYmd ? [seedIso] : [];
  }

  let cursor = seedIso;
  for (let step = 0; step < MAX_CALENDAR_OCCURRENCE_STEPS; step++) {
    const prev = previousReminderDueDate(cursor, recurrence, timezone);
    if (prev === cursor) break;
    if (!Number.isFinite(Date.parse(prev))) break;
    if (zonedDateKey(new Date(prev), timezone) < fromYmd) break;
    cursor = prev;
  }

  const out: string[] = [];
  for (let step = 0; step < MAX_CALENDAR_OCCURRENCE_STEPS; step++) {
    const cursorMs = Date.parse(cursor);
    if (!Number.isFinite(cursorMs)) break;
    const key = zonedDateKey(new Date(cursorMs), timezone);
    if (key > toYmd) break;
    if (key >= fromYmd) out.push(cursor);
    const next = advanceReminderDueDate(cursor, recurrence, timezone);
    if (next === cursor) break;
    cursor = next;
  }
  return out;
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
