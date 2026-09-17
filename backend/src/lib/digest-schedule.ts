import { getZonedParts } from "../utils/timezone.js";

const DEFAULT_TIMEZONE = "Asia/Jerusalem";

export type DigestDays = "weekdays" | "everyday";

/** Israeli work week: Sunday–Thursday. */
export function isIsraeliWeekday(weekday: number): boolean {
  return weekday >= 0 && weekday <= 4;
}

export function shouldSendDigestNow(options: {
  now?: Date;
  hours: number[];
  days: DigestDays;
  lastSentAt: string | null;
  timezone?: string;
}): boolean {
  const now = options.now ?? new Date();
  const timezone = options.timezone ?? DEFAULT_TIMEZONE;
  const parts = getZonedParts(now, timezone);
  const hours = options.hours.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  if (hours.length === 0) return false;
  if (!hours.includes(parts.hour)) return false;
  if (options.days === "weekdays" && !isIsraeliWeekday(parts.weekday)) return false;

  if (options.lastSentAt) {
    const last = getZonedParts(new Date(options.lastSentAt), timezone);
    if (
      last.year === parts.year &&
      last.month === parts.month &&
      last.day === parts.day &&
      last.hour === parts.hour
    ) {
      return false;
    }
  }

  return true;
}
