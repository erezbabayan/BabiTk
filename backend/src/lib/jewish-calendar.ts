/**
 * Israel calendar helpers (Jerusalem candles, Hebrew phrases).
 * No network. Fail open: a library error must not block a send or a capture.
 * Copied to supabase/functions/_shared and convex/lib — keep the three files identical.
 */
import { HebrewCalendar, Location, flags, type Event } from "@hebcal/core";

const TIMEZONE = "Asia/Jerusalem";
const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function zonedParts(date: Date): Parts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "0";
  const hour = Number(get("hour"));
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: hour === 24 ? 0 : hour,
    minute: Number(get("minute")),
    weekday: WEEKDAY[get("weekday")] ?? 0,
  };
}

function offsetOf(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const offset = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = offset.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  if (!match) return "+00:00";
  const sign = match[1]!.startsWith("-") ? "-" : "+";
  const hourNum = Math.abs(Number.parseInt(match[1]!, 10));
  return `${sign}${pad(hourNum)}:${match[2] ?? "00"}`;
}

export function jerusalemIso(year: number, month: number, day: number, hour: number, minute: number): string {
  let ts = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const got = zonedParts(new Date(ts));
    const diffMinutes =
      (year - got.year) * 525_600 +
      (month - got.month) * 43_200 +
      (day - got.day) * 1_440 +
      (hour - got.hour) * 60 +
      (minute - got.minute);
    ts += diffMinutes * 60_000;
  }
  const resolved = zonedParts(new Date(ts));
  return `${resolved.year}-${pad(resolved.month)}-${pad(resolved.day)}T${pad(resolved.hour)}:${pad(resolved.minute)}:00${offsetOf(new Date(ts))}`;
}

function addDays(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function eventTime(event: Event): Date | null {
  const timed = (event as Event & { eventTime?: Date | null }).eventTime;
  return timed instanceof Date ? timed : null;
}

function eventYmd(event: Event): { year: number; month: number; day: number } {
  const greg = event.getDate().greg();
  return { year: greg.getFullYear(), month: greg.getMonth() + 1, day: greg.getDate() };
}

let jerusalem: ReturnType<typeof Location.lookup> | null = null;

function location(): NonNullable<ReturnType<typeof Location.lookup>> {
  if (!jerusalem) {
    const found = Location.lookup("Jerusalem");
    if (!found) throw new Error("jerusalem_missing");
    jerusalem = found;
  }
  return jerusalem;
}

const rangeCache = new Map<string, Event[]>();

function eventsBetween(start: Date, end: Date, candlelighting: boolean): Event[] {
  const key = `${start.toISOString().slice(0, 10)}:${end.toISOString().slice(0, 10)}:${candlelighting ? 1 : 0}`;
  const cached = rangeCache.get(key);
  if (cached) return cached;
  const rows = HebrewCalendar.calendar({
    start,
    end,
    il: true,
    location: location(),
    candlelighting,
    sedrot: false,
    omer: false,
    noRoshChodesh: true,
    noMinorFast: true,
    noSpecialShabbat: true,
  });
  if (rangeCache.size > 24) rangeCache.clear();
  rangeCache.set(key, rows);
  return rows;
}

function isFridayCandles(event: Event): boolean {
  const stamp = eventTime(event);
  if (event.getDesc() !== "Candle lighting" || !stamp) return false;
  const mask = event.getFlags();
  if ((mask & flags.LIGHT_CANDLES) === 0) return false;
  if ((mask & flags.EREV) !== 0 || (mask & flags.CHANUKAH_CANDLES) !== 0) return false;
  return zonedParts(stamp).weekday === 5;
}

function isSaturdayHavdalah(event: Event): boolean {
  const stamp = eventTime(event);
  if (event.getDesc() !== "Havdalah" || !stamp) return false;
  const mask = event.getFlags();
  if ((mask & flags.LIGHT_CANDLES_TZEIS) === 0) return false;
  if ((mask & flags.CHAG) !== 0) return false;
  return zonedParts(stamp).weekday === 6;
}

/** Friday candle-lighting through Saturday havdalah, Jerusalem. False if hebcal fails. */
export function isInsideShabbatQuiet(now = new Date()): boolean {
  try {
    const start = new Date(now.getTime() - 3 * 86_400_000);
    const end = new Date(now.getTime() + 2 * 86_400_000);
    const rows = eventsBetween(start, end, true);
    const candles = rows.filter(isFridayCandles).map((event) => eventTime(event)!);
    const havdalah = rows.filter(isSaturdayHavdalah).map((event) => eventTime(event)!);
    const open = candles.filter((stamp) => stamp.getTime() <= now.getTime()).sort((a, b) => b.getTime() - a.getTime())[0];
    if (!open) return false;
    const close = havdalah
      .filter((stamp) => stamp.getTime() > open.getTime())
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (!close) return false;
    return now.getTime() < close.getTime();
  } catch {
    return false;
  }
}

const PHRASE =
  /(?:בערב\s+פסח|ערב\s+פסח|אחרי\s+ס(?:ו)?כות|לפני\s+שבת|אחרי\s+שבת|במוצ(?:אי\s+שבת|״ש|"ש|׳ש|'ש)|אחרי\s+החג)/u;

export function mentionsJewishPhrase(text: string): boolean {
  return PHRASE.test(text.replace(/\s+/g, " ").trim());
}

function nextHavdalah(now: Date): string | null {
  const rows = eventsBetween(new Date(now.getTime() - 86_400_000), new Date(now.getTime() + 10 * 86_400_000), true);
  const upcoming = rows
    .filter(isSaturdayHavdalah)
    .map((event) => eventTime(event)!)
    .filter((stamp) => stamp.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return upcoming ? upcoming.toISOString() : null;
}

function nextFridayNoon(now: Date): string {
  const parts = zonedParts(now);
  let delta = (5 - parts.weekday + 7) % 7;
  if (delta === 0 && parts.hour * 60 + parts.minute >= 12 * 60) delta = 7;
  const day = addDays(parts.year, parts.month, parts.day, delta);
  return jerusalemIso(day.year, day.month, day.day, 12, 0);
}

function datedEvents(now: Date): Event[] {
  const start = new Date(now.getTime() - 20 * 86_400_000);
  const end = new Date(now.getTime() + 400 * 86_400_000);
  return eventsBetween(start, end, false);
}

function ymdOf(event: Event): string {
  const ymd = eventYmd(event);
  return dateKey(ymd.year, ymd.month, ymd.day);
}

function todayKey(now: Date): string {
  const parts = zonedParts(now);
  return dateKey(parts.year, parts.month, parts.day);
}

function atNine(ymd: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  return jerusalemIso(Number(match[1]), Number(match[2]), Number(match[3]), 9, 0);
}

function dayAfter(ymd: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const next = addDays(Number(match[1]), Number(match[2]), Number(match[3]), 1);
  return jerusalemIso(next.year, next.month, next.day, 9, 0);
}

function firstOnOrAfter(events: Event[], desc: string, today: string): Event | null {
  return (
    events
      .filter((event) => event.getDesc() === desc && ymdOf(event) >= today)
      .sort((a, b) => ymdOf(a).localeCompare(ymdOf(b)))[0] ?? null
  );
}

function afterHoliday(events: Event[], today: string): string | null {
  const endings: Array<{ desc: string }> = [
    { desc: "Pesach VII" },
    { desc: "Shmini Atzeret" },
    { desc: "Shavuot" },
    { desc: "Yom Kippur" },
    { desc: "Rosh Hashana II" },
  ];
  const candidates: string[] = [];
  for (const ending of endings) {
    const event = firstOnOrAfter(events, ending.desc, today);
    if (!event) continue;
    const ymd = ymdOf(event);
    const after = addDays(
      Number(ymd.slice(0, 4)),
      Number(ymd.slice(5, 7)),
      Number(ymd.slice(8, 10)),
      1,
    );
    const key = dateKey(after.year, after.month, after.day);
    if (key >= today) candidates.push(key);
  }
  candidates.sort();
  return candidates[0] ? atNine(candidates[0]) : null;
}

/** Civil due instant for a Hebrew phrase. Null when the text is not one of these phrases. */
export function resolveJewishPhrase(text: string, now = new Date()): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!PHRASE.test(normalized)) return null;
  try {
    if (/ב?ערב\s+פסח/u.test(normalized)) {
      const event = firstOnOrAfter(datedEvents(now), "Erev Pesach", todayKey(now));
      return event ? atNine(ymdOf(event)) : null;
    }
    if (/אחרי\s+ס(?:ו)?כות/u.test(normalized)) {
      const event = firstOnOrAfter(datedEvents(now), "Shmini Atzeret", todayKey(now));
      return event ? dayAfter(ymdOf(event)) : null;
    }
    if (/לפני\s+שבת/u.test(normalized)) return nextFridayNoon(now);
    if (/אחרי\s+שבת|במוצ/u.test(normalized)) return nextHavdalah(now);
    if (/אחרי\s+החג/u.test(normalized)) return afterHoliday(datedEvents(now), todayKey(now));
    return null;
  } catch {
    return null;
  }
}

export function fillEmptyJewishDue<T extends { due_date?: string | null }>(
  text: string,
  rows: T[],
  now = new Date(),
): T[] {
  if (!rows.some((row) => !row.due_date)) return rows;
  if (!mentionsJewishPhrase(text)) return rows;
  const due = resolveJewishPhrase(text, now);
  if (!due) return rows;
  return rows.map((row) => (row.due_date ? row : { ...row, due_date: due }));
}
