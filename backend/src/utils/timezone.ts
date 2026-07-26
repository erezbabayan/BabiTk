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

export function getTimezoneOffset(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);

  const offset = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = offset.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  if (!match) {
    return "+00:00";
  }

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

  for (let i = 0; i < 4; i++) {
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

/** Add calendar months, keeping the clock time; clamps day to month length. */
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

export function addZonedMinutes(
  timeZone: string,
  referenceDate: Date,
  minutes: number,
): string {
  const shifted = new Date(referenceDate.getTime() + minutes * 60_000);
  const parts = getZonedParts(shifted, timeZone);
  return zonedLocalToIso(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: parts.hour,
      minute: parts.minute,
      second: 0,
    },
    timeZone,
  );
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function nextWeekdayIso(
  timeZone: string,
  referenceDate: Date,
  targetWeekday: number,
  hour: number,
  minute: number,
): string {
  const ref = getZonedParts(referenceDate, timeZone);
  let delta = targetWeekday - ref.weekday;
  if (delta < 0) {
    delta += 7;
  }
  if (delta === 0) {
    const nowMinutes = ref.hour * 60 + ref.minute;
    const targetMinutes = hour * 60 + minute;
    if (nowMinutes >= targetMinutes) {
      delta = 7;
    }
  }
  return addZonedDays(timeZone, referenceDate, delta, hour, minute);
}

export function normalizeDueDateIso(
  value: string | null | undefined,
  timeZone: string,
): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/[+-]\d{2}:\d{2}$|Z$/i.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    const parts = getZonedParts(parsed, timeZone);
    return zonedLocalToIso(parts, timeZone);
  }

  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) return null;

  return zonedLocalToIso(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: match[6] ? Number(match[6]) : 0,
    },
    timeZone,
  );
}
