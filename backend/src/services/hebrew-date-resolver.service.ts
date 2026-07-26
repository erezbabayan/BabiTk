import {
  addZonedDays,
  addZonedMinutes,
  addZonedMonths,
  getZonedParts,
  nextWeekdayIso,
  zonedLocalToIso,
} from "../utils/timezone.js";
import {
  extractTimeOfDay,
  isConcreteClockMention,
  stripHebrewTimePhrases,
} from "../utils/hebrew-time-words.js";

const HEBREW_WEEKDAYS: Record<string, number> = {
  ראשון: 0,
  שני: 1,
  שלישי: 2,
  רביעי: 3,
  חמישי: 4,
  שישי: 5,
  שבת: 6,
};

/** Hebrew letter weekdays: א׳=Sun … ש׳=Sat */
const WEEKDAY_LETTERS: Record<string, number> = {
  א: 0,
  ב: 1,
  ג: 2,
  ד: 3,
  ה: 4,
  ו: 5,
  ש: 6,
};

const WEEKDAY_NAME = "ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת";

/** ביום ראשון / יום ראשון / בראשון / ליום ראשון / ביום הראשון / … הקרוב|הבא
 * Note: bare "לשבת" is NOT matched (false positive with "לשבת על זה"). */
const WEEKDAY_PHRASE = `(?:עד\\s+)?(?:ביום\\s+ה?|יום\\s+ה?|ליום\\s+ה?|ב)(?:${WEEKDAY_NAME})(?:\\s+ה(?:בא|קרוב))?`;

const WEEKEND_RE = /(?:בסוף\s+השבוע|ב?סופ["״']?ש|ב?סופש)/u;

const TIME_HINT = new RegExp(
  `(?:מחרתיים|ממחרתיים|מחר|היום|הערב|בבוקר|בערב|בצהריים|בצהרים|בלילה|אחר\\s*הצהריים|אחה["״']?צ|אחהצ|חצות|${WEEKDAY_PHRASE}|ביום\\s+[א-וש]|יום\\s+[א-וש]|בעוד|עוד\\s+(?:\\d+|שעה|שעתיים|חצי|רבע|שבוע|חודש|מעט|רגע)|שבוע|חודש|סוף\\s+השבוע|סופ["״']?ש|סופש|עד\\s+יום|ב(?:שעה\\s+)?(?:עשר|אחת|שתיים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע)|\\d{1,2}[:\\.]\\d{2}|\\d{1,2}[./]\\d{1,2})`,
  "u",
);

const STRONGER_DATE_ANCHOR = new RegExp(
  `(?:מחרתיים|ממחרתיים|מחר|(?:בעוד|עוד)\\s+(?:\\d+\\s+ימים?|שבוע|חודש|חודשיים)|שבוע\\s+הבא|בחודש\\s+הבא|${WEEKDAY_PHRASE}|ביום\\s+[א-וש]|יום\\s+[א-וש]|${WEEKEND_RE.source}|\\d{1,2}[./]\\d{1,2})`,
  "u",
);

const NEXT_WEEK_RE = /(?:בעוד\s+שבוע|עוד\s+שבוע|שבוע\s+הבא|בשבוע\s+הבא)/u;

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
    matchRelativeDuration(normalized, timezone, referenceDate) ??
    matchSoftNear(normalized, timezone, referenceDate) ??
    matchTomorrowWithTime(normalized, timezone, referenceDate) ??
    matchTomorrowMorning(normalized, timezone, referenceDate) ??
    matchTomorrowEvening(normalized, timezone, referenceDate) ??
    matchTomorrow(normalized, timezone, referenceDate) ??
    matchDayAfterTomorrow(normalized, timezone, referenceDate) ??
    matchTodayWithTime(normalized, timezone, referenceDate) ??
    matchWeekday(normalized, timezone, referenceDate) ??
    matchWeekdayLetter(normalized, timezone, referenceDate) ??
    matchInDays(normalized, timezone, referenceDate) ??
    matchInMonths(normalized, timezone, referenceDate) ??
    matchNextWeek(normalized, timezone, referenceDate) ??
    matchEndOfWeek(normalized, timezone, referenceDate) ??
    matchSpokenClock(normalized, timezone, referenceDate) ??
    matchTodayEvening(normalized, timezone, referenceDate) ??
    matchTodayMorning(normalized, timezone, referenceDate) ??
    matchBareAfternoon(normalized, timezone, referenceDate) ??
    matchBareNoon(normalized, timezone, referenceDate) ??
    matchBareNight(normalized, timezone, referenceDate) ??
    matchMidnight(normalized, timezone, referenceDate) ??
    matchClockTime(normalized, timezone, referenceDate)
  );
}

function matchExplicitDate(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  const last = findLastExplicitDateMatch(text);
  if (!last) return null;
  return explicitMatchToIso(last, timezone, referenceDate);
}

function findLastExplicitDateMatch(text: string): RegExpMatchArray | null {
  const pattern =
    /(?:^|[\s,(])ב?[-\s]?(\d{1,2})[\./](\d{1,2})(?:[\./](\d{2,4}))?(?:\s+ב[-\s]?(\d{1,2})(?:[:\.](\d{2}))?)?/giu;
  let last: RegExpMatchArray | null = null;
  for (const match of text.matchAll(pattern)) {
    last = match;
  }
  return last;
}

function explicitMatchToIso(
  match: RegExpMatchArray,
  timezone: string,
  referenceDate: Date,
): string | null {
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

function matchRelativeDuration(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  // בעוד שעתיים / עוד שעה / בעוד 3 שעות
  const hoursWord = text.match(/(?:בעוד|עוד)\s+(שעתיים|שעה)(?=[\s,.]|$)/u);
  if (hoursWord?.[1]) {
    const hours = hoursWord[1] === "שעתיים" ? 2 : 1;
    return addZonedMinutes(timezone, referenceDate, hours * 60);
  }

  const hoursNum = text.match(/(?:בעוד|עוד)\s+(\d+)\s+שעות?(?=[\s,.]|$)/u);
  if (hoursNum?.[1]) {
    return addZonedMinutes(timezone, referenceDate, Number(hoursNum[1]) * 60);
  }

  // בעוד חצי שעה / עוד רבע שעה
  if (/(?:בעוד|עוד)\s+חצי\s+שעה/u.test(text)) {
    return addZonedMinutes(timezone, referenceDate, 30);
  }
  if (/(?:בעוד|עוד)\s+רבע\s+שעה/u.test(text)) {
    return addZonedMinutes(timezone, referenceDate, 15);
  }

  // בעוד 20 דקות / עוד דקה
  const minutesNum = text.match(/(?:בעוד|עוד)\s+(\d+)\s+דקות?(?=[\s,.]|$)/u);
  if (minutesNum?.[1]) {
    return addZonedMinutes(timezone, referenceDate, Number(minutesNum[1]));
  }
  if (/(?:בעוד|עוד)\s+דקה(?=[\s,.]|$)/u.test(text)) {
    return addZonedMinutes(timezone, referenceDate, 1);
  }

  return null;
}

function matchSoftNear(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  if (/(?:^|[\s,])(?:עוד\s+מעט|בעוד\s+מעט)(?=[\s,.]|$)/u.test(text)) {
    return addZonedMinutes(timezone, referenceDate, 15);
  }
  if (/(?:^|[\s,])(?:עוד\s+רגע|בעוד\s+רגע)(?=[\s,.]|$)/u.test(text)) {
    return addZonedMinutes(timezone, referenceDate, 5);
  }
  return null;
}

function matchTomorrowWithTime(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  if (!/מחר/u.test(text) || /מחרתיים|ממחרתיים/u.test(text)) return null;
  if (!extractTimeOfDay(text)) return null;

  const { hour, minute } = resolveClockTime(text, 9, 0);
  return addZonedDays(timezone, referenceDate, 1, hour, minute);
}

function matchTomorrowMorning(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  if (!/מחר\s+בבוקר/u.test(text) || /מחרתיים|ממחרתיים/u.test(text)) return null;
  return addZonedDays(timezone, referenceDate, 1, 9, 0);
}

function matchTomorrowEvening(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  if (!/מחר\s+בערב/u.test(text) || /מחרתיים|ממחרתיים/u.test(text)) return null;
  return addZonedDays(timezone, referenceDate, 1, 19, 0);
}

function matchTomorrow(text: string, timezone: string, referenceDate: Date): string | null {
  if (/מחרתיים|ממחרתיים/u.test(text)) return null;
  if (!/(?:^|[\s,])מחר(?:\s|$|[,.])/u.test(text)) return null;
  if (/מחר\s+ב/u.test(text)) return null;
  return addZonedDays(timezone, referenceDate, 1, 9, 0);
}

function matchDayAfterTomorrow(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  if (!/(?:ממחרתיים|מחרתיים)/u.test(text)) return null;
  const { hour, minute } = resolveClockTime(text, 9, 0);
  return addZonedDays(timezone, referenceDate, 2, hour, minute);
}

function matchTodayEvening(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  const explicitToday = /(?:היום\s+בערב|הערב)(?:\s|$|[,.])/u.test(text);
  const bareEvening = /(?:^|[\s,])בערב(?=[\s,.]|$)/iu.test(text);
  if (!explicitToday && !bareEvening) return null;
  if (!explicitToday && STRONGER_DATE_ANCHOR.test(text)) return null;
  return todayOrTomorrowAt(timezone, referenceDate, 19, 0);
}

function matchTodayMorning(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  const explicitToday = /(?:היום\s+בבוקר|הבוקר)(?:\s|$|[,.])/u.test(text);
  const bareMorning = /(?:^|[\s,])בבוקר(?=[\s,.]|$)/iu.test(text);
  if (!explicitToday && !bareMorning) return null;
  if (!explicitToday && STRONGER_DATE_ANCHOR.test(text)) return null;
  return todayOrTomorrowAt(timezone, referenceDate, 9, 0);
}

function matchSpokenClock(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  const parsed = extractTimeOfDay(text);
  if (!isConcreteClockMention(parsed) || !parsed) return null;
  return todayOrTomorrowAt(timezone, referenceDate, parsed.hour, parsed.minute);
}

function matchBareAfternoon(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  if (
    !/(?:^|[\s,])(?:אחר\s*הצהריים|אחר\s*הצהרים|אחה["״']?צ['׳]?|אחהצ)(?=[\s,.]|$)/iu.test(
      text,
    )
  ) {
    return null;
  }
  if (STRONGER_DATE_ANCHOR.test(text) || /היום|מחר/u.test(text)) return null;
  if (isConcreteClockMention(extractTimeOfDay(text))) return null;
  return todayOrTomorrowAt(timezone, referenceDate, 15, 0);
}

function matchBareNoon(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  if (!/(?:^|[\s,])(?:בצהריים|בצהרים)(?=[\s,.]|$)/iu.test(text)) return null;
  if (STRONGER_DATE_ANCHOR.test(text) || /היום|מחר/u.test(text)) return null;
  return todayOrTomorrowAt(timezone, referenceDate, 12, 0);
}

function matchBareNight(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  if (!/(?:^|[\s,])בלילה(?=[\s,.]|$)/iu.test(text)) return null;
  if (STRONGER_DATE_ANCHOR.test(text) || /היום|מחר/u.test(text)) return null;
  if (isConcreteClockMention(extractTimeOfDay(text))) return null;
  return todayOrTomorrowAt(timezone, referenceDate, 21, 0);
}

function matchMidnight(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  if (!/(?:^|[\s,])(?:ב)?חצות(?:\s+הלילה)?(?=[\s,.]|$)/iu.test(text)) return null;
  return todayOrTomorrowAt(timezone, referenceDate, 0, 0);
}

function matchTodayWithTime(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  if (!/היום/u.test(text) || !extractTimeOfDay(text)) return null;

  const { hour, minute } = resolveClockTime(text, 9, 0);
  return todayOrTomorrowAt(timezone, referenceDate, hour, minute);
}

function matchWeekday(text: string, timezone: string, referenceDate: Date): string | null {
  const match = text.match(
    new RegExp(
      `(?:עד\\s+)?(?:ביום\\s+ה?|יום\\s+ה?|ליום\\s+ה?|ב)(${WEEKDAY_NAME})(?:\\s+ה(?:בא|קרוב))?`,
      "u",
    ),
  );
  if (!match) return null;

  const weekday = HEBREW_WEEKDAYS[match[1]!];
  if (weekday === undefined) return null;

  const { hour, minute } = resolveClockTime(text, 9, 0);
  return nextWeekdayIso(timezone, referenceDate, weekday, hour, minute);
}

function matchWeekdayLetter(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  const match = text.match(
    /(?:עד\s+)?(?:ביום\s+|יום\s+|ליום\s+)([א-וש])['׳]?(?=\s|$|[,.])/u,
  );
  if (!match?.[1]) return null;

  const weekday = WEEKDAY_LETTERS[match[1]];
  if (weekday === undefined) return null;

  const { hour, minute } = resolveClockTime(text, 9, 0);
  return nextWeekdayIso(timezone, referenceDate, weekday, hour, minute);
}

function matchInDays(text: string, timezone: string, referenceDate: Date): string | null {
  const match = text.match(/(?:בעוד|עוד)\s+(\d+)\s+ימים?/u);
  if (!match) return null;
  const { hour, minute } = resolveClockTime(text, 9, 0);
  return addZonedDays(timezone, referenceDate, Number(match[1]), hour, minute);
}

function matchInMonths(
  text: string,
  timezone: string,
  referenceDate: Date,
): string | null {
  let months: number | null = null;
  if (/(?:בעוד\s+חודשיים|עוד\s+חודשיים)/u.test(text)) {
    months = 2;
  } else if (/(?:בחודש\s+הבא|בעוד\s+חודש|עוד\s+חודש)(?=[\s,.]|$)/u.test(text)) {
    months = 1;
  }
  if (months === null) return null;
  const { hour, minute } = resolveClockTime(text, 9, 0);
  return addZonedMonths(timezone, referenceDate, months, hour, minute);
}

function matchNextWeek(text: string, timezone: string, referenceDate: Date): string | null {
  if (!NEXT_WEEK_RE.test(text)) return null;
  const { hour, minute } = resolveClockTime(text, 9, 0);
  return addZonedDays(timezone, referenceDate, 7, hour, minute);
}

function matchEndOfWeek(text: string, timezone: string, referenceDate: Date): string | null {
  if (!WEEKEND_RE.test(text)) return null;
  return nextWeekdayIso(timezone, referenceDate, 4, 17, 0);
}

function matchClockTime(text: string, timezone: string, referenceDate: Date): string | null {
  const match = text.match(/(?:^|[\s,])(?:ב|בשעה\s+)?(\d{1,2})[:\.](\d{2})(?:\s|$|[,.])/u);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return todayOrTomorrowAt(timezone, referenceDate, hour, minute);
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

/** If the target local time already passed today, schedule for tomorrow. */
function todayOrTomorrowAt(
  timezone: string,
  referenceDate: Date,
  hour: number,
  minute: number,
): string {
  const ref = getZonedParts(referenceDate, timezone);
  const nowMinutes = ref.hour * 60 + ref.minute;
  const targetMinutes = hour * 60 + minute;
  if (nowMinutes >= targetMinutes) {
    return addZonedDays(timezone, referenceDate, 1, hour, minute);
  }
  return todayAt(timezone, referenceDate, hour, minute);
}

export function stripTemporalPhrases(text: string): string {
  return stripHebrewTimePhrases(
    text
      .replace(/\s*מחר\s+בבוקר\s*/giu, " ")
      .replace(/\s*מחר\s+בערב\s*/giu, " ")
      .replace(/\s*מחר\s+ב[-\s]?\d{1,2}(?:[:\.]\d{2})?\s*/giu, " ")
      .replace(/\s*ממחרתיים\s*/giu, " ")
      .replace(/\s*מחרתיים\s*/giu, " ")
      .replace(/\s*מחר\s*/giu, " ")
      .replace(/\s*היום\s+בערב\s*/giu, " ")
      .replace(/\s*היום\s+בבוקר\s*/giu, " ")
      .replace(/\s*היום\s+ב[-\s]?\d{1,2}(?:[:\.]\d{2})?\s*/giu, " ")
      .replace(/\s*הערב\s*/giu, " ")
      .replace(/\s*הבוקר\s*/giu, " ")
      .replace(/\s*בערב\s*/giu, " ")
      .replace(/\s*בבוקר\s*/giu, " ")
      .replace(
        new RegExp(
          `\\s*(?:עד\\s+)?(?:ביום\\s+ה?|יום\\s+ה?|ליום\\s+ה?|ב)(?:${WEEKDAY_NAME})(?:\\s+ה(?:בא|קרוב))?\\s*`,
          "giu",
        ),
        " ",
      )
      .replace(/\s*(?:עד\s+)?(?:ביום\s+|יום\s+|ליום\s+)[א-וש]['׳]?\s*/giu, " ")
      .replace(/\s*(?:בעוד|עוד)\s+\d+\s+(?:ימים?|שעות?|דקות?)\s*/giu, " ")
      .replace(/\s*(?:בעוד|עוד)\s+(?:שעתיים|שעה|חצי\s+שעה|רבע\s+שעה|דקה)\s*/giu, " ")
      .replace(/\s*(?:בעוד|עוד)\s+(?:מעט|רגע)\s*/giu, " ")
      .replace(/\s*(?:בעוד\s+שבוע|עוד\s+שבוע|שבוע\s+הבא|בשבוע\s+הבא)\s*/giu, " ")
      .replace(/\s*(?:בחודש\s+הבא|בעוד\s+חודשיים|בעוד\s+חודש|עוד\s+חודש)\s*/giu, " ")
      .replace(/\s*(?:בסוף\s+השבוע|ב?סופ["״']?ש|ב?סופש)\s*/giu, " ")
      .replace(/\s*ב[-\s]?\d{1,2}[:\.]\d{2}\s*/giu, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}
