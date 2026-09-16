import { getReminderFlags } from "./resolve-item-reminder";
import { formatItemReminder } from "./item-display";

const OPEN_STATUSES = new Set(["inbox", "pending"]);

/** Missed due dates still alert if they fired within the last day. */
export const REMINDER_MAX_OVERDUE_MS = 24 * 60 * 60 * 1000;

export interface ReminderSourceItem {
  id: string;
  title: string;
  is_actionable: boolean;
  status: string;
  due_date: string | null;
  metadata?: unknown;
  deleted_at?: string | null;
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

/**
 * When this task/note should fire an active reminder, or null if none.
 * Tasks with a due date always fire at that time unless the reminder was
 * cancelled or already sent.
 */
export function resolveItemReminderFireAt(item: ReminderSourceItem): string | null {
  if (item.deleted_at) return null;
  if (!OPEN_STATUSES.has(item.status)) return null;

  const flags = getReminderFlags(item.metadata);
  if (flags.disabled || isReminderSent(item.metadata)) return null;

  if (item.is_actionable) {
    return readNotifyAt(item.metadata) ?? item.due_date ?? null;
  }

  if (flags.manual) {
    return item.due_date ?? readNotifyAt(item.metadata);
  }
  return null;
}

export function isItemDueForReminder(
  item: ReminderSourceItem,
  now = Date.now(),
  maxOverdueMs = REMINDER_MAX_OVERDUE_MS,
): boolean {
  const fireAt = resolveItemReminderFireAt(item);
  if (!fireAt) return false;
  const ms = Date.parse(fireAt);
  if (!Number.isFinite(ms) || ms > now) return false;
  return now - ms <= maxOverdueMs;
}

export function nextUpcomingReminderDelayMs(
  items: ReminderSourceItem[],
  now = Date.now(),
): number | null {
  let soonest: number | null = null;
  for (const item of items) {
    const fireAt = resolveItemReminderFireAt(item);
    if (!fireAt) continue;
    const ms = Date.parse(fireAt);
    if (!Number.isFinite(ms) || ms <= now) continue;
    const delay = ms - now;
    if (soonest === null || delay < soonest) soonest = delay;
  }
  return soonest;
}

export function reminderAlertId(itemId: string, fireAt: string): string {
  return `due:${itemId}:${fireAt}`;
}

export function formatReminderAlertBody(item: ReminderSourceItem, fireAt: string): string {
  const when = formatItemReminder(fireAt);
  if (item.is_actionable) {
    return when ? `הגיע מועד המשימה · ${when}` : "הגיע מועד המשימה.";
  }
  return when ? `הגיע מועד התזכורת · ${when}` : "הגיע מועד התזכורת.";
}

export function reminderKindForItem(item: Pick<ReminderSourceItem, "is_actionable">): "task" | "notebook" {
  return item.is_actionable ? "task" : "notebook";
}
