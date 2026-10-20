import { flags, gematriya, getHolidaysOnDate, HDate, Locale } from "@hebcal/core";

export type HebrewDayMarker = "shabbat" | "holiday";

export type HebrewDayMark = {
  ymd: string;
  /** Gematria day only, e.g. ט״ו. */
  dayLabel: string;
  /** Everyday month name, including אדר א׳ / אדר ב׳ in a leap year. */
  monthLabel: string;
  yearLabel: string;
  /** Compact cell text: day and month, e.g. ט׳ חשון or א׳ אדר ב׳. */
  cellLabel: string;
  /** Full date, e.g. ט״ו בתשרי תשפ״ז. */
  full: string;
  /** One holiday name, without vowel marks. */
  holiday: string | null;
  shabbat: boolean;
  marker: HebrewDayMarker | null;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayCache = new Map<string, HebrewDayMark>();
const headingCache = new Map<string, string>();

const HOLIDAY_RANK: Array<[number, number]> = [
  [flags.CHAG, 80],
  [flags.MAJOR_FAST, 70],
  [flags.CHOL_HAMOED, 60],
  [flags.MODERN_HOLIDAY, 50],
  [flags.MINOR_HOLIDAY, 40],
  [flags.MINOR_FAST, 30],
  [flags.EREV, 20],
  [flags.SPECIAL_SHABBAT, 10],
];

function plainHebrew(text: string): string {
  return text
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replaceAll("סכות", "סוכות")
    .replaceAll("כפור", "כיפור")
    .replaceAll("הזכרון", "הזיכרון")
    .replace(/\s+\d{4}$/, "");
}

function holidayLabel(description: string, rendered: string): string {
  if (description.startsWith("Chanukah")) return "חנוכה";
  return plainHebrew(rendered);
}

function holidayRank(flagBits: number): number {
  let rank = 0;
  for (const [flag, score] of HOLIDAY_RANK) {
    if ((flagBits & flag) !== 0 && score > rank) rank = score;
  }
  return rank;
}

function noonUtc(ymd: string): Date {
  return new Date(`${ymd}T12:00:00Z`);
}

export function hebrewDayMark(ymd: string): HebrewDayMark | null {
  if (!YMD_RE.test(ymd)) return null;
  const cached = dayCache.get(ymd);
  if (cached) return cached;
  const date = noonUtc(ymd);
  if (Number.isNaN(date.getTime())) return null;
  const hebrew = new HDate(date);
  const dayLabel = gematriya(hebrew.getDate());
  const monthLabel = plainHebrew(Locale.gettext(hebrew.getMonthName(), "he"));
  const yearLabel = gematriya(hebrew.getFullYear());
  const events = getHolidaysOnDate(hebrew, true) ?? [];
  const named = events
    .map((event) => ({ rank: holidayRank(event.getFlags()), label: holidayLabel(event.getDesc(), event.render("he")) }))
    .filter((event) => event.rank > 0 && event.label.length > 0)
    .sort((a, b) => b.rank - a.rank);
  const labels: string[] = [];
  for (const event of named) {
    if (labels.includes(event.label)) continue;
    labels.push(event.label);
    if (labels.length === 2) break;
  }
  const holiday = labels.length > 0 ? labels.join(" · ") : null;
  const shabbat = date.getUTCDay() === 6;
  const mark: HebrewDayMark = {
    ymd,
    dayLabel,
    monthLabel,
    yearLabel,
    cellLabel: `${dayLabel} ${monthLabel}`,
    full: `${dayLabel} ב${monthLabel} ${yearLabel}`,
    holiday,
    shabbat,
    marker: holiday ? "holiday" : shabbat ? "shabbat" : null,
  };
  dayCache.set(ymd, mark);
  return mark;
}

function lastCivilDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Hebrew month (or the two months a civil month spans) and year, once per header. */
export function hebrewMonthHeading(year: number, month: number): string {
  const key = `${year}-${month}`;
  const cached = headingCache.get(key);
  if (cached) return cached;
  const first = hebrewDayMark(`${year}-${String(month).padStart(2, "0")}-01`);
  const last = hebrewDayMark(
    `${year}-${String(month).padStart(2, "0")}-${String(lastCivilDay(year, month)).padStart(2, "0")}`,
  );
  if (!first || !last) return "";
  let heading: string;
  if (first.monthLabel === last.monthLabel && first.yearLabel === last.yearLabel) {
    heading = `${first.monthLabel} ${first.yearLabel}`;
  } else if (first.yearLabel === last.yearLabel) {
    heading = `${first.monthLabel}–${last.monthLabel} ${first.yearLabel}`;
  } else {
    heading = `${first.monthLabel} ${first.yearLabel} – ${last.monthLabel} ${last.yearLabel}`;
  }
  headingCache.set(key, heading);
  return heading;
}

export function hebrewDayTooltip(mark: HebrewDayMark): string {
  return mark.holiday ? `${mark.full} · ${mark.holiday}` : mark.full;
}
