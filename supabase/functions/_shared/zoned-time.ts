/** Jerusalem-aware calendar arithmetic for Edge reminder roll-forward. */

export const DEFAULT_TIMEZONE = "Asia/Jerusalem";

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_SHORT[get("weekday")] ?? 0,
  };
}

function getTimezoneOffset(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);

  const offset = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = offset.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  if (!match) return "+00:00";

  const sign = match[1]!.startsWith("-") ? "-" : "+";
  const hourNum = Math.abs(Number.parseInt(match[1]!, 10));
  const hours = `${sign}${String(hourNum).padStart(2, "0")}`;
  const minutes = match[2] ?? "00";
  return `${hours}:${minutes}`;
}

export function zonedLocalToIso(
  parts: Pick<ZonedParts, "year" | "month" | "day" | "hour" | "minute"> & { second?: number },
  timeZone: string,
): string {
  const second = parts.second ?? 0;
  let ts = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, second);

  for (let i = 0; i < 4; i += 1) {
    const got = getZonedParts(new Date(ts), timeZone);
    const diffMinutes =
      (parts.year - got.year) * 525_600 +
      (parts.month - got.month) * 43_200 +
      (parts.day - got.day) * 1_440 +
      (parts.hour - got.hour) * 60 +
      (parts.minute - got.minute);
    ts += diffMinutes * 60_000;
  }

  const resolved = getZonedParts(new Date(ts), timeZone);
  const offset = getTimezoneOffset(new Date(ts), timeZone);
  return `${pad2(resolved.year)}-${pad2(resolved.month)}-${pad2(resolved.day)}T${pad2(resolved.hour)}:${pad2(resolved.minute)}:${pad2(second)}${offset}`;
}

export function addZonedDays(
  timeZone: string,
  referenceDate: Date,
  days: number,
  hour: number,
  minute: number,
): string {
  const ref = getZonedParts(referenceDate, timeZone);
  const anchor = zonedLocalToIso({ ...ref, hour: 12, minute: 0, second: 0 }, timeZone);
  const shifted = new Date(new Date(anchor).getTime() + days * 86_400_000);
  const target = getZonedParts(shifted, timeZone);
  return zonedLocalToIso({ ...target, hour, minute, second: 0 }, timeZone);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addZonedMonths(
  timeZone: string,
  referenceDate: Date,
  months: number,
  hour: number,
  minute: number,
): string {
  const ref = getZonedParts(referenceDate, timeZone);
  const total = ref.month - 1 + months;
  const year = ref.year + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12 + 1;
  const day = Math.min(ref.day, daysInMonth(year, month));
  return zonedLocalToIso({ year, month, day, hour, minute, second: 0 }, timeZone);
}

function addDaysKeepingTime(timeZone: string, fromIso: string, days: number): string {
  const from = new Date(fromIso);
  const parts = getZonedParts(from, timeZone);
  return addZonedDays(timeZone, from, days, parts.hour, parts.minute);
}

/** +N local days from the original due clock. Missing original uses `now`. */
export function postponeOriginalDueByDays(
  originalDue: string | null | undefined,
  days = 7,
  timeZone = DEFAULT_TIMEZONE,
  now = new Date(),
): string {
  const parsed = originalDue ? Date.parse(originalDue) : Number.NaN;
  const sourceIso = Number.isFinite(parsed) ? new Date(parsed).toISOString() : now.toISOString();
  return addDaysKeepingTime(timeZone, sourceIso, days);
}

/** Clears the sent flag so a snoozed reminder can fire again at `dueDate`. */
export function reminderMetadataForNewDue(metadata: unknown, dueDate: string): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" ? { ...(metadata as Record<string, unknown>) } : {};
  const analysisRaw = base.analysis;
  const analysis =
    analysisRaw && typeof analysisRaw === "object"
      ? { ...(analysisRaw as Record<string, unknown>) }
      : {};
  analysis.target_at = dueDate;
  analysis.notify_at = dueDate;
  return {
    ...base,
    analysis,
    reminder_sent: false,
    reminder_disabled: false,
    reminder_manual: true,
  };
}

function addMonthsKeepingTime(timeZone: string, fromIso: string, months: number): string {
  const from = new Date(fromIso);
  const parts = getZonedParts(from, timeZone);
  return addZonedMonths(timeZone, from, months, parts.hour, parts.minute);
}

function isIsraeliWeekday(weekday: number): boolean {
  return weekday >= 0 && weekday <= 4;
}

export type ReminderRecurrence = "daily" | "weekly" | "monthly" | "weekdays";

/** Next fire time after `fromIso` in Asia/Jerusalem (not UTC). */
export function advanceZonedDueDate(
  fromIso: string,
  recurrence: ReminderRecurrence,
  timeZone = DEFAULT_TIMEZONE,
): string {
  switch (recurrence) {
    case "daily":
      return addDaysKeepingTime(timeZone, fromIso, 1);
    case "weekly":
      return addDaysKeepingTime(timeZone, fromIso, 7);
    case "monthly":
      return addMonthsKeepingTime(timeZone, fromIso, 1);
    case "weekdays": {
      let candidate = addDaysKeepingTime(timeZone, fromIso, 1);
      for (let i = 0; i < 8; i += 1) {
        const weekday = getZonedParts(new Date(candidate), timeZone).weekday;
        if (isIsraeliWeekday(weekday)) return candidate;
        candidate = addDaysKeepingTime(timeZone, candidate, 1);
      }
      return candidate;
    }
  }
}
