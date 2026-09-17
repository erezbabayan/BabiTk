import { getZonedParts } from "../utils/timezone.js";
import type { ReminderKind } from "./whatsapp-reminder-message.js";

export const DIGEST_TIMEZONE = "Asia/Jerusalem";
export const DEFAULT_DIGEST_HOUR = 9;
export const MAX_DIGEST_HOURS = 3;
export const DIGEST_ITEM_CAP = 20;

export type DigestDays = "weekdays" | "everyday";

export interface DigestItem {
  kind: ReminderKind;
  title: string;
  fireAt: string;
}

export function resolveDigestHours(hours: unknown): number[] {
  const source = Array.isArray(hours) ? hours : [];
  const unique = [
    ...new Set(
      source
        .map((hour) => Number(hour))
        .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23),
    ),
  ].sort((a, b) => a - b);
  return unique.length > 0 ? unique.slice(0, MAX_DIGEST_HOURS) : [DEFAULT_DIGEST_HOUR];
}

export function resolveDigestDays(value: unknown): DigestDays {
  return value === "weekdays" ? "weekdays" : "everyday";
}

/** Israel weekdays: Sunday–Thursday. */
export function isDigestDayAllowed(weekday: number, days: DigestDays): boolean {
  if (days === "weekdays") {
    return weekday >= 0 && weekday <= 4;
  }
  return true;
}

export function localDateKey(now: Date, timeZone = DIGEST_TIMEZONE): string {
  const parts = getZonedParts(now, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function localHour(now: Date, timeZone = DIGEST_TIMEZONE): number {
  const hour = getZonedParts(now, timeZone).hour;
  return hour === 24 ? 0 : hour;
}

export function localWeekday(now: Date, timeZone = DIGEST_TIMEZONE): number {
  return getZonedParts(now, timeZone).weekday;
}

export function digestSlotKey(digestDate: string, hour: number): string {
  return `${digestDate}:${hour}`;
}

export function isSameLocalDay(iso: string, now: Date, timeZone = DIGEST_TIMEZONE): boolean {
  const fireMs = Date.parse(iso);
  if (!Number.isFinite(fireMs)) return false;
  const fireParts = getZonedParts(new Date(fireMs), timeZone);
  const nowParts = getZonedParts(now, timeZone);
  return (
    fireParts.year === nowParts.year &&
    fireParts.month === nowParts.month &&
    fireParts.day === nowParts.day
  );
}

export function appendDigestSlot(existing: unknown, slotKey: string, digestDate: string): string[] {
  const current = Array.isArray(existing)
    ? existing.filter((slot): slot is string => typeof slot === "string")
    : [];
  const kept = current.filter((slot) => slot.startsWith(`${digestDate}:`));
  if (!kept.includes(slotKey)) kept.push(slotKey);
  return kept;
}

function formatTimeLabel(iso: string): string {
  try {
    const parts = getZonedParts(new Date(iso), DIGEST_TIMEZONE);
    const hour = parts.hour === 24 ? 0 : parts.hour;
    return `${String(hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function formatDigestDateLabel(digestDate: string): string {
  const [year, month, day] = digestDate.split("-");
  if (!year || !month || !day) return digestDate;
  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
}

export function buildWhatsAppDigestMessage(items: DigestItem[], digestDate: string): string {
  const dateLabel = formatDigestDateLabel(digestDate);
  const header = `ריכוז תזכורות (${dateLabel}) מ-BabiTk`;
  if (items.length === 0) {
    return `${header}\n\nאין תזכורות מתוזמנות להיום.`;
  }

  const seen = new Set<string>();
  const unique = items
    .slice()
    .sort((a, b) => a.fireAt.localeCompare(b.fireAt))
    .filter((item) => {
      const key = `${item.kind}|${item.title}|${item.fireAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const lines = unique.slice(0, DIGEST_ITEM_CAP).map((item, index) => {
    const time = formatTimeLabel(item.fireAt) || "00:00";
    const kindLabel = item.kind === "list" ? "רשימה" : item.kind === "note" ? "הערה" : "משימה";
    return `${index + 1}. ${item.title.trim() || kindLabel} — ${time}`;
  });
  const extra =
    unique.length > DIGEST_ITEM_CAP
      ? `\n…ועוד ${unique.length - DIGEST_ITEM_CAP} תזכורות`
      : "";
  return `${header}\n\n${lines.join("\n")}${extra}\n\nכל תזכורת נשלחת גם בזמן שמוגדר לה.\nכתבו «תפריט» לשאלות מובנות (היום / מחר / עבודה).`;
}
