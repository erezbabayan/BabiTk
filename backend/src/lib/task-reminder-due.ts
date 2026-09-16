/** Missed due dates still send if they fired within the last day. */
export const REMINDER_MAX_OVERDUE_MS = 24 * 60 * 60 * 1000;

/** Look ahead so notify_at (up to ~1h before due_date) is included. */
export const REMINDER_DUE_LOOKAHEAD_MS = 60 * 60 * 1000;

export interface ReminderDueItem {
  due_date: string | null;
  is_actionable: boolean;
  metadata?: unknown;
}

function readNotifyAt(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const analysis = (metadata as Record<string, unknown>).analysis;
  if (!analysis || typeof analysis !== "object") return null;
  const notifyAt = (analysis as Record<string, unknown>).notify_at;
  return typeof notifyAt === "string" && notifyAt.trim() ? notifyAt : null;
}

function isReminderSent(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return (metadata as Record<string, unknown>).reminder_sent === true;
}

function isReminderDisabled(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return (metadata as Record<string, unknown>).reminder_disabled === true;
}

function isManualReminder(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return (metadata as Record<string, unknown>).reminder_manual === true;
}

export function resolveCronReminderFireAt(item: ReminderDueItem): string | null {
  if (isReminderSent(item.metadata) || isReminderDisabled(item.metadata)) {
    return null;
  }
  if (item.is_actionable) {
    return readNotifyAt(item.metadata) || item.due_date || null;
  }
  if (isManualReminder(item.metadata) && item.due_date) {
    return item.due_date;
  }
  return null;
}

export function isCronReminderDue(
  item: ReminderDueItem,
  nowMs = Date.now(),
  maxOverdueMs = REMINDER_MAX_OVERDUE_MS,
): boolean {
  const fireAt = resolveCronReminderFireAt(item);
  if (!fireAt) return false;
  const ms = Date.parse(fireAt);
  if (!Number.isFinite(ms) || ms > nowMs) return false;
  return nowMs - ms <= maxOverdueMs;
}

export function reminderDueQueryCutoffIso(nowMs = Date.now()): string {
  return new Date(nowMs + REMINDER_DUE_LOOKAHEAD_MS).toISOString();
}
