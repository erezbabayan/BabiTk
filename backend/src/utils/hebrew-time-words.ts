export interface ParsedHebrewTime {
  hour: number;
  minute: number;
  raw: string;
}

/** All common spoken hour forms (gender + spelling variants). */
const HEBREW_HOUR_WORDS: ReadonlyArray<{ pattern: string; hour: number }> = [
  { pattern: "אחת עשרה|אחת-עשרה|אחד עשר|אחד-עשר|אחת\\s+עשרה", hour: 11 },
  {
    pattern:
      "שתים עשרה|שתיים עשרה|שניים עשר|שנים עשר|שתים-עשרה|שתיים-עשרה|שתים\\s+עשרה|שתיים\\s+עשרה",
    hour: 12,
  },
  { pattern: "שתיים|שניים|שתים|שנים", hour: 2 },
  { pattern: "אחת|אחד", hour: 1 },
  { pattern: "שלושה|שלוש", hour: 3 },
  { pattern: "ארבעה|ארבע", hour: 4 },
  { pattern: "חמישה|חמש", hour: 5 },
  { pattern: "שישה|שש", hour: 6 },
  { pattern: "שבעה|שבע", hour: 7 },
  { pattern: "שמונה", hour: 8 },
  { pattern: "תשעה|תשע", hour: 9 },
  { pattern: "עשרה|עשר", hour: 10 },
];

const HOUR_WORD_ALTERNATION = HEBREW_HOUR_WORDS.map((entry) => entry.pattern).join("|");

/** Day-part tokens (with optional ב/ה prefixes in matching). */
const DAY_PART =
  "(?:בבוקר|הבוקר|בצהריים|בצהרים|בערב|הערב|בלילה|אחר\\s*הצהריים|אחר\\s*הצהרים|אחה[\"״']?צ['׳]?|אחהצ)";

const HALF_OR_QUARTER = "(?:\\s+וחצי|\\s+ורבע|\\s+וחצי\\s+ל|\\s+ורבע\\s+ל)?";

const TIME_OF_DAY_SUFFIX = `(?:\\s+${DAY_PART})?`;

/** בעשר / בשעה עשר / ב-10 — optional day-part */
const DIGIT_TIME_RE = new RegExp(
  `(?:^|[\\s,])(?:ב[-\\s]?|בשעה\\s+)?(\\d{1,2})(?:[:\\.](\\d{2}))?${HALF_OR_QUARTER}${TIME_OF_DAY_SUFFIX}(?=[\\s,.]|$)`,
  "iu",
);

/** בעשר בלילה / בשעה שלוש בערב / בחמש אחה״צ */
const WORD_TIME_WITH_B_RE = new RegExp(
  `(?:^|[\\s,])ב(?:שעה\\s+)?(${HOUR_WORD_ALTERNATION})${HALF_OR_QUARTER}${TIME_OF_DAY_SUFFIX}(?=[\\s,.]|$)`,
  "iu",
);

/**
 * Hour word WITHOUT leading ב, but WITH a day-part:
 * "עשר בלילה", "שלוש בערב", "חמש אחה״צ"
 */
const WORD_TIME_BARE_WITH_DAYPART_RE = new RegExp(
  `(?:^|[\\s,])(${HOUR_WORD_ALTERNATION})${HALF_OR_QUARTER}\\s+(${DAY_PART})(?=[\\s,.]|$)`,
  "iu",
);

/** "חמש וחצי" / "שלוש ורבע" without day-part — absolute hour as spoken. */
const WORD_TIME_HALF_QUARTER_RE = new RegExp(
  `(?:^|[\\s,])(${HOUR_WORD_ALTERNATION})(?:\\s+וחצי|\\s+ורבע)(?=[\\s,.]|$)`,
  "iu",
);

const MORNING_ONLY_RE = /(?:^|[\s,])(?:בבוקר|הבוקר)(?=[\s,.]|$)/iu;
const EVENING_ONLY_RE = /(?:^|[\s,])(?:בערב|הערב)(?=[\s,.]|$)/iu;
const NOON_ONLY_RE = /(?:^|[\s,])(?:בצהריים|בצהרים)(?=[\s,.]|$)/iu;
const AFTERNOON_ONLY_RE =
  /(?:^|[\s,])(?:אחר\s*הצהריים|אחר\s*הצהרים|אחה["״']?צ['׳]?|אחהצ)(?=[\s,.]|$)/iu;
const NIGHT_ONLY_RE = /(?:^|[\s,])בלילה(?=[\s,.]|$)/iu;
const MIDNIGHT_RE = /(?:^|[\s,])(?:ב)?חצות(?:\s+הלילה)?(?=[\s,.]|$)/iu;

const BARE_DAYPART_RAWS = new Set([
  "בבוקר",
  "הבוקר",
  "בערב",
  "הערב",
  "בצהריים",
  "בצהרים",
  "בלילה",
  "אחר הצהריים",
  "אחר הצהרים",
  "אחה״צ",
  "אחהצ",
  "בחצות",
  "חצות",
]);

function hourFromWord(token: string): number | null {
  const normalized = token.trim().replace(/-/g, " ").replace(/\s+/g, " ");
  for (const entry of HEBREW_HOUR_WORDS) {
    const re = new RegExp(`^(?:${entry.pattern})$`, "iu");
    if (re.test(normalized)) {
      return entry.hour;
    }
  }
  return null;
}

/** True when the parse includes a concrete clock hour (not only "בערב"/"בלילה"). */
export function isConcreteClockMention(parsed: ParsedHebrewTime | null): boolean {
  if (!parsed) return false;
  const raw = parsed.raw.trim().replace(/\s+/g, " ");
  if (BARE_DAYPART_RAWS.has(raw)) return false;
  if (/^(?:אחר\s*הצהריים|אחר\s*הצהרים|אחה["״']?צ['׳]?|אחהצ)$/iu.test(raw)) {
    return false;
  }
  if (/^(?:ב)?חצות(?:\s+הלילה)?$/iu.test(raw)) return true; // midnight is a concrete clock
  return true;
}

function applyDayPart(
  hour: number,
  dayPart: string | undefined,
  halfHour: boolean,
  quarterHour: boolean,
): { hour: number; minute: number } {
  let minute = 0;
  if (halfHour) minute = 30;
  else if (quarterHour) minute = 15;

  const part = (dayPart ?? "").trim();

  if (/בבוקר|הבוקר/iu.test(part)) {
    return { hour: hour === 12 ? 12 : hour, minute };
  }

  if (/בצהריים|בצהרים/iu.test(part) && !/אחר/iu.test(part)) {
    if (hour === 12) return { hour: 12, minute };
    if (hour >= 1 && hour <= 6) return { hour: hour + 12, minute };
    return { hour, minute };
  }

  if (/אחר\s*הצהריים|אחר\s*הצהרים|אחה["״']?צ|אחהצ/iu.test(part)) {
    if (hour >= 1 && hour <= 11) {
      return { hour: hour + 12, minute };
    }
    return { hour, minute };
  }

  if (/בערב|הערב/iu.test(part)) {
    if (hour >= 1 && hour <= 11) {
      return { hour: hour + 12, minute };
    }
    return { hour, minute };
  }

  if (/בלילה/iu.test(part)) {
    // Colloquial Hebrew: 1–5 בלילה = 01:00–05:00; 6–11 בלילה = 18:00–23:00; 12 = 00:00
    if (hour === 12) return { hour: 0, minute };
    if (hour >= 1 && hour <= 5) return { hour, minute };
    if (hour >= 6 && hour <= 11) return { hour: hour + 12, minute };
    return { hour, minute };
  }

  return { hour, minute };
}

function dayPartFromMatch(matched: string): string | undefined {
  const m = matched.match(
    new RegExp(
      `\\s+(${DAY_PART}|הבוקר|הערב)\\s*$`,
      "iu",
    ),
  );
  return m?.[1];
}

function hasHalf(text: string): boolean {
  return /וחצי/u.test(text) && !/וחצי\s+ל/u.test(text);
}

function hasQuarter(text: string): boolean {
  return /ורבע/u.test(text) && !/ורבע\s+ל/u.test(text);
}

export function extractTimeOfDay(text: string): ParsedHebrewTime | null {
  if (MIDNIGHT_RE.test(text)) {
    return { hour: 0, minute: 0, raw: "חצות" };
  }

  const digitMatch = text.match(DIGIT_TIME_RE);
  if (digitMatch?.index !== undefined) {
    const hour = Number(digitMatch[1]);
    if (hour >= 0 && hour <= 23) {
      const minuteFromDigits = digitMatch[2] ? Number(digitMatch[2]) : null;
      const dayPart = dayPartFromMatch(digitMatch[0]);
      const applied = applyDayPart(hour, dayPart, hasHalf(digitMatch[0]), hasQuarter(digitMatch[0]));
      return {
        hour: applied.hour,
        minute: minuteFromDigits ?? applied.minute,
        raw: digitMatch[0].trim(),
      };
    }
  }

  const withB = text.match(WORD_TIME_WITH_B_RE);
  if (withB?.index !== undefined && withB[1]) {
    const baseHour = hourFromWord(withB[1]);
    if (baseHour !== null) {
      const applied = applyDayPart(
        baseHour,
        dayPartFromMatch(withB[0]),
        hasHalf(withB[0]),
        hasQuarter(withB[0]),
      );
      return { hour: applied.hour, minute: applied.minute, raw: withB[0].trim() };
    }
  }

  const bareWithDayPart = text.match(WORD_TIME_BARE_WITH_DAYPART_RE);
  if (bareWithDayPart?.index !== undefined && bareWithDayPart[1]) {
    const baseHour = hourFromWord(bareWithDayPart[1]);
    if (baseHour !== null) {
      const applied = applyDayPart(
        baseHour,
        bareWithDayPart[2],
        hasHalf(bareWithDayPart[0]),
        hasQuarter(bareWithDayPart[0]),
      );
      return {
        hour: applied.hour,
        minute: applied.minute,
        raw: bareWithDayPart[0].trim(),
      };
    }
  }

  const halfQuarter = text.match(WORD_TIME_HALF_QUARTER_RE);
  if (halfQuarter?.index !== undefined && halfQuarter[1]) {
    const baseHour = hourFromWord(halfQuarter[1]);
    if (baseHour !== null) {
      const applied = applyDayPart(
        baseHour,
        undefined,
        hasHalf(halfQuarter[0]),
        hasQuarter(halfQuarter[0]),
      );
      return {
        hour: applied.hour,
        minute: applied.minute,
        raw: halfQuarter[0].trim(),
      };
    }
  }

  if (MORNING_ONLY_RE.test(text)) {
    return { hour: 9, minute: 0, raw: "בבוקר" };
  }

  if (EVENING_ONLY_RE.test(text)) {
    return { hour: 19, minute: 0, raw: "בערב" };
  }

  if (AFTERNOON_ONLY_RE.test(text)) {
    return { hour: 15, minute: 0, raw: "אחר הצהריים" };
  }

  if (NOON_ONLY_RE.test(text)) {
    return { hour: 12, minute: 0, raw: "בצהריים" };
  }

  if (NIGHT_ONLY_RE.test(text)) {
    return { hour: 21, minute: 0, raw: "בלילה" };
  }

  return null;
}

export function stripHebrewTimePhrases(text: string): string {
  return text
    .replace(
      new RegExp(
        `\\s*(?:ב[-\\s]?|בשעה\\s+)?(?:${HOUR_WORD_ALTERNATION}|\\d{1,2})(?:[:\\.]\\d{2})?(?:\\s+וחצי|\\s+ורבע)?(?:\\s+${DAY_PART})?\\s*`,
        "giu",
      ),
      " ",
    )
    .replace(
      new RegExp(
        `\\s*(?:${HOUR_WORD_ALTERNATION})(?:\\s+וחצי|\\s+ורבע)?\\s+${DAY_PART}\\s*`,
        "giu",
      ),
      " ",
    )
    .replace(
      new RegExp(
        `\\s*(?:${HOUR_WORD_ALTERNATION})(?:\\s+וחצי|\\s+ורבע)\\s*`,
        "giu",
      ),
      " ",
    )
    .replace(/\s*(?:ב)?חצות(?:\s+הלילה)?\s*/giu, " ")
    .replace(/\s*אחר\s*הצהריים\s*/giu, " ")
    .replace(/\s*אחר\s*הצהרים\s*/giu, " ")
    .replace(/\s*אחה["״']?צ['׳]?\s*/giu, " ")
    .replace(/\s*אחהצ\s*/giu, " ")
    .replace(/\s*בבוקר\s*/giu, " ")
    .replace(/\s*בצהריים\s*/giu, " ")
    .replace(/\s*בצהרים\s*/giu, " ")
    .replace(/\s*בערב\s*/giu, " ")
    .replace(/\s*בלילה\s*/giu, " ")
    .replace(/\s*הבוקר\s*/giu, " ")
    .replace(/\s*הערב\s*/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
