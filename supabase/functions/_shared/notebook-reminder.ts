/**
 * Daily "items waiting in the notebook" reminder (מחברת = mindtasker_items.status 'inbox').
 * Pure helpers only (no Deno / npm imports) so the backend node tests can import this file.
 */

export const NOTEBOOK_REMINDER_TIMEZONE = "Asia/Jerusalem";
export const DEFAULT_NOTEBOOK_REMINDER_HOUR = 19;
export const DEFAULT_NOTEBOOK_REMINDER_MINUTE = 0;
/**
 * The GitHub cron that drives whatsapp-send-reminders is scheduled every 15 minutes but
 * often runs hours late. Send at the first tick at/after the chosen time, as long as it is
 * still within this window on the same local day.
 */
export const NOTEBOOK_REMINDER_WINDOW_MINUTES = 4 * 60;
export const NOTEBOOK_REMINDER_MAX_TITLES = 3;
export const NOTEBOOK_REMINDER_TITLE_MAX_CHARS = 40;
export const NOTEBOOK_REMINDER_LINK = "https://erezbabayan.github.io/BabiTk/";

export type NotebookReminderPrefs = {
  enabled: boolean;
  hour: number;
  minute: number;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.trunc(parsed);
  if (rounded < min || rounded > max) return fallback;
  return rounded;
}

/** Missing columns / nulls fall back to the defaults: enabled at 19:00. */
export function normalizeNotebookReminderPrefs(row: {
  notebook_reminder_enabled?: boolean | null;
  notebook_reminder_hour?: number | null;
  notebook_reminder_minute?: number | null;
} | null | undefined): NotebookReminderPrefs {
  return {
    enabled: row?.notebook_reminder_enabled !== false,
    hour: clampInt(row?.notebook_reminder_hour, 0, 23, DEFAULT_NOTEBOOK_REMINDER_HOUR),
    minute: clampInt(row?.notebook_reminder_minute, 0, 59, DEFAULT_NOTEBOOK_REMINDER_MINUTE),
  };
}

export function formatNotebookReminderTime(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** "HH:MM" from an <input type="time"> → hour/minute, or null when invalid. */
export function parseNotebookReminderTime(value: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const hour = get("hour");
  return {
    dateKey: `${get("year")}-${pad2(get("month"))}-${pad2(get("day"))}`,
    minutes: (hour === 24 ? 0 : hour) * 60 + get("minute"),
  };
}

export function notebookReminderDateKey(now: Date, timeZone = NOTEBOOK_REMINDER_TIMEZONE): string {
  return localParts(now, timeZone).dateKey;
}

/**
 * Due when local time is at/after the chosen time, still the same local day, within the
 * catch-up window, and nothing was sent today yet.
 */
export function isNotebookReminderDue(
  now: Date,
  prefs: NotebookReminderPrefs,
  lastSentOn: string | null | undefined,
  timeZone = NOTEBOOK_REMINDER_TIMEZONE,
): boolean {
  if (!prefs.enabled) return false;
  const local = localParts(now, timeZone);
  if (lastSentOn && String(lastSentOn).slice(0, 10) === local.dateKey) return false;
  const elapsed = local.minutes - (prefs.hour * 60 + prefs.minute);
  return elapsed >= 0 && elapsed <= NOTEBOOK_REMINDER_WINDOW_MINUTES;
}

function shortTitle(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= NOTEBOOK_REMINDER_TITLE_MAX_CHARS) return clean;
  return `${clean.slice(0, NOTEBOOK_REMINDER_TITLE_MAX_CHARS - 1).trimEnd()}…`;
}

/** null when there is nothing waiting: never send an empty reminder. */
export function buildNotebookReminderMessage(
  count: number,
  titles: string[] = [],
  link = NOTEBOOK_REMINDER_LINK,
): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const head =
    count === 1
      ? "📒 יש לך פריט אחד במחברת שמחכה לטיפול"
      : `📒 יש לך ${count} פריטים במחברת שמחכים לטיפול`;
  const lines = [head];
  const shown = titles
    .map((title) => shortTitle(String(title ?? "")))
    .filter((title) => title.length > 0)
    .slice(0, NOTEBOOK_REMINDER_MAX_TITLES);
  for (const title of shown) lines.push(`• ${title}`);
  const rest = count - shown.length;
  if (shown.length > 0 && rest > 0) lines.push(`ועוד ${rest}…`);
  if (link) lines.push("", `לפתיחת המחברת: ${link}`);
  return lines.join("\n");
}
