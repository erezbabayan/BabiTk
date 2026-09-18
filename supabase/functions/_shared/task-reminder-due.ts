/** Missed due dates still send if they fired within the last day. */
export const REMINDER_MAX_OVERDUE_MS = 24 * 60 * 60 * 1000;

/** Look ahead so notify_at (up to ~1h before due_date) is included. */
export const REMINDER_DUE_LOOKAHEAD_MS = 60 * 60 * 1000;

export function reminderDueQueryCutoffIso(nowMs = Date.now()): string {
  return new Date(nowMs + REMINDER_DUE_LOOKAHEAD_MS).toISOString();
}

export function isReminderOverdueBeyondWindow(
  fireAt: string,
  nowMs = Date.now(),
  maxOverdueMs = REMINDER_MAX_OVERDUE_MS,
): boolean {
  const ms = Date.parse(fireAt);
  if (!Number.isFinite(ms)) return true;
  return nowMs - ms > maxOverdueMs;
}

/** Local-day digest: due dates from yesterday through tomorrow. */
export function digestDueWindowIso(nowMs = Date.now()): { start: string; end: string } {
  const span = 36 * 60 * 60 * 1000;
  return {
    start: new Date(nowMs - span).toISOString(),
    end: new Date(nowMs + span).toISOString(),
  };
}
