export interface ParsedHebrewTime {
  hour: number;
  minute: number;
  /** Raw matched phrase, for stripping from titles. */
  raw: string;
}

const HEBREW_HOUR_WORDS: ReadonlyArray<{ pattern: string; hour: number }> = [
  { pattern: "אחת עשרה|אחת-עשרה|אחד עשר|אחד-עשר", hour: 11 },
  { pattern: "שתים עשרה|שתיים עשרה|שניים עשר|שנים עשר", hour: 12 },
  { pattern: "שתיים|שניים|שתים", hour: 2 },
  { pattern: "אחת|אחד", hour: 1 },
  { pattern: "שלושה|שלוש", hour: 3 },
  { pattern: "ארבעה|ארבע", hour: 4 },
  { pattern: "חמישה|חמש", hour: 5 },
  { pattern: "שישה|שש", hour: 6 },
  { pattern: "שבעה|שבע", hour: 7 },
  { pattern: "שמונה", hour: 8 },
  { pattern: "תשעה|תשע", hour: 9 },
  { pattern: "עשרה|עשר", hour: 10 },
  { pattern: "שתים|שנים", hour: 2 },
];

const HOUR_WORD_ALTERNATION = HEBREW_HOUR_WORDS.map((entry) => entry.pattern).join("|");

const TIME_OF_DAY_SUFFIX =
  "(?:\\s+בבוקר|\\s+בצהריים|\\s+בצהרים|\\s+בערב|\\s+בלילה)?";

const DIGIT_TIME_RE = new RegExp(
  `(?:^|[\\s,])(?:ב[-\\s]?|בשעה\\s+)?(\\d{1,2})(?:[:\\.](\\d{2}))?(?:\\s+וחצי|\\s+ורבע)?${TIME_OF_DAY_SUFFIX}(?=[\\s,.]|$)`,
  "iu",
);

const WORD_TIME_RE = new RegExp(
  `(?:^|[\\s,])ב(?:שעה\\s+)?(${HOUR_WORD_ALTERNATION})(?:\\s+וחצי|\\s+ורבע)?${TIME_OF_DAY_SUFFIX}(?=[\\s,.]|$)`,
  "iu",
);

const MORNING_ONLY_RE = /(?:^|[\s,])(?:בבוקר|הבוקר)(?=[\s,.]|$)/iu;
const EVENING_ONLY_RE = /(?:^|[\s,])(?:בערב|הערב)(?=[\s,.]|$)/iu;

function hourFromWord(token: string): number | null {
  const normalized = token.trim();
  for (const entry of HEBREW_HOUR_WORDS) {
    const re = new RegExp(`^(?:${entry.pattern})$`, "iu");
    if (re.test(normalized)) {
      return entry.hour;
    }
  }
  return null;
}

function applyDayPart(
  hour: number,
  text: string,
  matchIndex: number,
): { hour: number; minute: number } {
  const tail = text.slice(matchIndex);
  let minute = 0;

  if (/\s+וחצי/iu.test(tail)) {
    minute = 30;
  } else if (/\s+ורבע/iu.test(tail)) {
    minute = 15;
  }

  if (/\s+בבוקר/iu.test(tail) || /(?:^|[\s,])(?:הבוקר)/iu.test(tail)) {
    return { hour: hour === 12 ? 12 : hour, minute };
  }

  if (/\s+בצהריים|\s+בצהרים/iu.test(tail)) {
    return { hour: hour <= 6 ? hour + 12 : hour, minute };
  }

  if (/\s+בערב/iu.test(tail) || /(?:^|[\s,])(?:הערב)/iu.test(tail)) {
    if (hour >= 1 && hour <= 11) {
      return { hour: hour + 12, minute };
    }
    return { hour, minute };
  }

  if (/\s+בלילה/iu.test(tail)) {
    if (hour >= 1 && hour <= 11) {
      return { hour: hour + 12, minute };
    }
    return { hour, minute };
  }

  return { hour, minute };
}

/**
 * Extracts the first clock time from Hebrew free text (digits or spoken hour words).
 */
export function extractTimeOfDay(text: string): ParsedHebrewTime | null {
  const digitMatch = text.match(DIGIT_TIME_RE);
  if (digitMatch?.index !== undefined) {
    const hour = Number(digitMatch[1]);
    const minute = digitMatch[2] ? Number(digitMatch[2]) : digitMatch[0].includes("וחצי") ? 30 : digitMatch[0].includes("ורבע") ? 15 : 0;
    const { hour: resolvedHour, minute: resolvedMinute } = applyDayPart(
      hour,
      text,
      digitMatch.index,
    );
    return {
      hour: resolvedHour,
      minute: resolvedMinute,
      raw: digitMatch[0].trim(),
    };
  }

  const wordMatch = text.match(WORD_TIME_RE);
  if (wordMatch?.index !== undefined && wordMatch[1]) {
    const baseHour = hourFromWord(wordMatch[1]);
    if (baseHour === null) return null;
    const { hour, minute } = applyDayPart(baseHour, text, wordMatch.index);
    return { hour, minute, raw: wordMatch[0].trim() };
  }

  if (MORNING_ONLY_RE.test(text)) {
    return { hour: 9, minute: 0, raw: "בבוקר" };
  }

  if (EVENING_ONLY_RE.test(text)) {
    return { hour: 19, minute: 0, raw: "בערב" };
  }

  return null;
}

export function stripHebrewTimePhrases(text: string): string {
  return text
    .replace(
      new RegExp(
        `\\s*ב[-\\s]?(?:שעה\\s+)?(?:${HOUR_WORD_ALTERNATION}|\\d{1,2})(?:[:\\.]\\d{2})?(?:\\s+וחצי|\\s+ורבע)?${TIME_OF_DAY_SUFFIX}\\s*`,
        "giu",
      ),
      " ",
    )
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
