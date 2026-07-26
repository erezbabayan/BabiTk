import { getReminderFlags } from "./resolveItemReminder";

/**
 * Normalize fire times to UTC `…Z` so indexed lexicographic compare matches
 * absolute time (offset strings like `+03:00` sort incorrectly vs `Z`).
 */
function toUtcIso(value: string): string | null {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * Denormalized fire time for reminder cron (ISO string, UTC Z).
 * Mirrors resolveNotifyAt in reminders.ts — keep in sync.
 */
export function computeNotifyAt(item: {
  isTask: boolean;
  dueDate: string | null | undefined;
  metadata: unknown;
}): string | null {
  const metadata = (item.metadata ?? {}) as Record<string, unknown>;
  const flags = getReminderFlags(metadata);
  if (flags.disabled || metadata.reminder_sent === true) return null;

  const analysis = metadata.analysis as Record<string, unknown> | undefined;
  let raw: string | null = null;
  if (item.isTask) {
    if (typeof analysis?.notify_at === "string" && analysis.notify_at) {
      raw = analysis.notify_at;
    } else if (flags.manual && item.dueDate) {
      raw = item.dueDate;
    } else if (item.dueDate) {
      raw = item.dueDate;
    }
  } else if (flags.manual && item.dueDate) {
    raw = item.dueDate;
  } else if (item.dueDate) {
    raw = item.dueDate;
  }

  if (!raw) return null;
  return toUtcIso(raw) ?? raw;
}

/** Convex patch value — undefined clears optional notifyAt. */
export function notifyAtPatchValue(
  item: {
    isTask: boolean;
    dueDate: string | null | undefined;
    metadata: unknown;
  },
  deleted?: boolean,
): string | undefined {
  if (deleted) return undefined;
  const at = computeNotifyAt(item);
  return at ?? undefined;
}
