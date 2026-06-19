import {
  addZonedDays,
  getZonedParts,
  nextWeekdayIso,
  zonedLocalToIso,
} from "../utils/timezone.js";
import { extractTimeOfDay, stripHebrewTimePhrases } from "../utils/hebrew-time-words.js";

const HEBREW_WEEKDAYS: Record<string, number> = {
  ראשון: 0,
  שני: 1,
  שלישי: 2,
  רביעי: 3,
  חמישי: 4,
  שישי: 5,
  שבת: 6,
};

const TIME_HINT =
  /(?:מחר|ממחרתיים|היום|הערב|בבוקר|בערב|ביום|יום\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)|בעוד|שבוע|סוף\s+השבוע|עד\s+יום|ב(?:שעה\s+)?(?:עשר|אחת|שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע)|\d{1,2}[:\.]\d{2}|\d{1,2}[\./]\d{1,2})/u;

function resolveClockTime(text: string, fallbackHour = 9, fallbackMinute = 0) {
  const parsed = extractTimeOfDay(text);
  return {
    hour: parsed?.hour ?? fallbackHour,
    minute: parsed?.minute ?? fallbackMinute,
  };
}

export interface ResolveDueDateOptions {
  timezone?: string;
  referenceDate?: Date;
}

export function hasTemporalHint(text: string): boolean {
  return TIME_HINT.test(text);
}

export function extractTimeMention(text: string): string | null {
  const match = text.match(TIME_HINT);
  return match ? match[0].trim() : null;
}

export function resolveDueDateFromText(
  text: string,
  options: ResolveDueDateOptions = {},
): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized || !hasTemporalHint(normalized)) {
    return null;
  }

  const timezone = options.timezone ?? "Asia/Jerusalem";
  const referenceDate = options.referenceDate ?? new Date();

  return (
    matchExplicitDate(normalized, timezone, referenceDate) ??
    matchTomorrowWithTime(normalized, timezone, referenceDate) ??
    matchTomorrowMorning(normalized, timezone, referenceDate) ??
    matchTomorrowEvening(normalized, timezone, referenceDate) ??
    matchTomorrow(normalized, timezone, referenceDate) ??
    matchTodayEvening(normalized, timezone, referenceDate) ??
    matchTodayMorning(normalized, timezone, referenceDate) ??
    matchTodayWithTime(normalized, timezone, referenceDate) ??
    matchWeekday(normalized, timezone, referenceDate) ??
    matchInDays(normalized, timezone, referenceDate) ??
    matchNextWeek(normalized, timezone, referenceDate) ??
    matchEndOfWeek(normalized, timezone, referenceDate) ??
    matchClockTime(normalized, timezone, referenceDate)
  );
}

function matchExplicitDate(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  const match = text.match(/(\d{1,2})[\./](\d{1,2})(?:[\./](\d{2,4}))?(?:\s+ב[-\s]?(\d{1,2})(?:[:\.](\d{2}))?)?/u);
  if (!match) return null;

  const ref = getZonedParts(referenceDate, timezone);
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = match[3] ? Number(match[3]) : ref.year;
  if (year < 100) {
    year += 2000;
  }
  const hour = match[4] ? Number(match[4]) : 9;
  const minute = match[5] ? Number(match[5]) : 0;

  return zonedLocalToIso({ year, month, day, hour, minute, second: 0 }, timezone);
}

function matchTomorrowWithTime(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  if (!/מחר/u.test(text)) return null;
  if (!extractTimeOfDay(text)) return null;

  const { hour, minute } = resolveClockTime(text, 9, 0);
  return addZonedDays(timezone, referenceDate, 1, hour, minute);
}

function matchTomorrowMorning(text: string, timezone: string, referenceDate: Date): string | null {
  if (!/מחר\s+בבוקר/u.test(text)) return null;
  return addZonedDays(timezone, referenceDate, 1, 9, 0);
}

function matchTomorrowEvening(text: string, timezone: string, referenceDate: Date): string | null {
  if (!/מחר\s+בערב/u.test(text)) return null;
  return addZonedDays(timezone, referenceDate, 1, 19, 0);
}

function matchTomorrow(text: string, timezone: string, referenceDate: Date): string | null {
  if (!/(?:^|[\s,])מחר(?:\s|$|[,.])/u.test(text)) return null;
  if (/מחר\s+ב/u.test(text)) return null;
  return addZonedDays(timezone, referenceDate, 1, 9, 0);
}

function matchTodayEvening(text: string, timezone: string, referenceDate: Date): string | null {
  if (!/(?:היום\s+בערב|הערב)/u.test(text)) return null;
  return todayAt(timezone, referenceDate, 19, 0);
}

function matchTodayMorning(text: string, timezone: string, referenceDate: Date): string | null {
  if (!/(?:היום\s+בבוקר|הבוקר)/u.test(text)) return null;
  return todayAt(timezone, referenceDate, 9, 0);
}

function matchTodayWithTime(text: string, timezone: string, referenceDate: Date): string | null {
  if (!/היום/u.test(text) || !extractTimeOfDay(text)) return null;

  const { hour, minute } = resolveClockTime(text, 9, 0);
  return todayAt(timezone, referenceDate, hour, minute);
}

function matchWeekday(text: string, timezone: string, referenceDate: Date): string | null {
  const match = text.match(/(?:עד\s+)?(?:ביום|יום)\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/u);
  if (!match) return null;

  const weekday = HEBREW_WEEKDAYS[match[1]!];
  if (weekday === undefined) return null;

  const { hour, minute } = resolveClockTime(text, 9, 0);
  return nextWeekdayIso(timezone, referenceDate, weekday, hour, minute);
}

function matchInDays(text: string, timezone: string, referenceDate: Date): string | null {
  const match = text.match(/בעוד\s+(\d+)\s+יום/u);
  if (!match) return null;
  return addZonedDays(timezone, referenceDate, Number(match[1]), 9, 0);
}

function matchNextWeek(text: string, timezone: string, referenceDate: Date): string | null {
  if (!/(?:בעוד\s+שבוע|שבוע\s+הבא)/u.test(text)) return null;
  return addZonedDays(timezone, referenceDate, 7, 9, 0);
}

function matchEndOfWeek(text: string, timezone: string, referenceDate: Date): string | null {
  if (!/בסוף\s+השבוע/u.test(text)) return null;
  return nextWeekdayIso(timezone, referenceDate, 4, 17, 0);
}

function matchClockTime(text: string, timezone: string, referenceDate: Date): string | null {
  const match = text.match(/(?:^|[\s,])(?:ב|בשעה\s+)?(\d{1,2})[:\.](\d{2})(?:\s|$|[,.])/u);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const ref = getZonedParts(referenceDate, timezone);
  const candidate = todayAt(timezone, referenceDate, hour, minute);
  const candidateParts = getZonedParts(new Date(candidate), timezone);
  const nowMinutes = ref.hour * 60 + ref.minute;
  const targetMinutes = hour * 60 + minute;

  if (
    candidateParts.year === ref.year &&
    candidateParts.month === ref.month &&
    candidateParts.day === ref.day &&
    nowMinutes >= targetMinutes
  ) {
    return addZonedDays(timezone, referenceDate, 1, hour, minute);
  }

  return candidate;
}

function todayAt(
  timezone: string,
  referenceDate: Date,
  hour: number,
  minute: number,
): string {
  const ref = getZonedParts(referenceDate, timezone);
  return zonedLocalToIso(
    { year: ref.year, month: ref.month, day: ref.day, hour, minute, second: 0 },
    timezone,
  );
}

export function stripTemporalPhrases(text: string): string {
  return stripHebrewTimePhrases(
    text
      .replace(/\s*מחר\s+בבוקר\s*/giu, " ")
      .replace(/\s*מחר\s+בערב\s*/giu, " ")
      .replace(/\s*מחר\s+ב[-\s]?\d{1,2}(?:[:\.]\d{2})?\s*/giu, " ")
      .replace(/\s*מחר\s*/giu, " ")
      .replace(/\s*היום\s+בערב\s*/giu, " ")
      .replace(/\s*היום\s+בבוקר\s*/giu, " ")
      .replace(/\s*היום\s+ב[-\s]?\d{1,2}(?:[:\.]\d{2})?\s*/giu, " ")
      .replace(/\s*הערב\s*/giu, " ")
      .replace(/\s*הבוקר\s*/giu, " ")
      .replace(/\s*(?:עד\s+)?(?:ביום|יום)\s+(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)\s*/giu, " ")
      .replace(/\s*בעוד\s+\d+\s+יום\s*/giu, " ")
      .replace(/\s*(?:בעוד\s+שבוע|שבוע\s+הבא)\s*/giu, " ")
      .replace(/\s*בסוף\s+השבוע\s*/giu, " ")
      .replace(/\s*ב[-\s]?\d{1,2}[:\.]\d{2}\s*/giu, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}
