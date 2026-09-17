/**
 * Deterministic Hebrew ASR proofread — Eliezer/ivrit.ai style post-processing.
 *
 * Whisper (and faster-whisper turbo, the stack Eliezer uses) often:
 * - picks a phonetic-but-wrong spelling (רואי → רועי)
 * - splits clitics (ל קנות → לקנות)
 * - drops a vav/yud in ktiv male (תזכרת → תזכורת)
 * - mangles Israeli slang (יאלה → יאללה)
 *
 * This is NOT an LLM. It is a high-confidence lexicon + clitic-aware
 * replacer, modeled on Hspell/HebMorph prefix handling (ב/ל/מ/ה/ו/ש/כ).
 *
 * Keep in sync with:
 *   supabase/functions/_shared/hebrew-asr-proofread.ts
 *   convex/lib/ingest/hebrewAsrSpelling.ts
 */

/** Vocabulary bias for Whisper / Groq / ivrit.ai turbo. */
export const HEBREW_ASR_WHISPER_PROMPT =
  "עברית מדוברת. משימות יומיום: לקנות, להתקשר, לשלוח, תזכורת, בבקשה, כוכבית. " +
  "סלנג: יאללה, סבבה, וואלה, תכלס, אחלה, אוקיי. " +
  "זמנים: מחר, מחרתיים, בצהריים, אחה״צ, סופ״ש. " +
  "שמות: רועי, נועם, אורי, גיא, עידו, עידן, מיכל, שירה, יעל, דנה, מאיה, הילה, אסף, ליאור, יונתן, דניאל, תום, רן, ניר, עומר, איתי, אביה, תמר, נועה, אביגיל, יובל, נועה.";

const HEBREW_PHRASE_FIXES: ReadonlyArray<readonly [wrong: string, right: string]> = [
  ["אחר ה צהריים", "אחר הצהריים"],
  ["אחרי ה צהריים", "אחרי הצהריים"],
  ["מחר ב צהריים", "מחר בצהריים"],
  ["מחרתיים ב צהריים", "מחרתיים בצהריים"],
  ["מחר ב בוקר", "מחר בבוקר"],
  ["מחר ב ערב", "מחר בערב"],
  ["תודה רבא", "תודה רבה"],
  ["תודה רבבה", "תודה רבה"],
  ["ב בקשה", "בבקשה"],
  ["ב בקשהה", "בבקשה"],
  ["ל התקשר", "להתקשר"],
  ["ל קנות", "לקנות"],
  ["ל שלוח", "לשלוח"],
  ["ל דבר", "לדבר"],
  ["ל סיים", "לסיים"],
  ["ל פגוש", "לפגוש"],
  ["ל קבוע", "לקבוע"],
  ["ל זכור", "לזכור"],
  ["ל הזכיר", "להזכיר"],
  ["ב שעה", "בשעה"],
  ["ב בוקר", "בבוקר"],
  ["ב ערב", "בערב"],
  ["ב צהריים", "בצהריים"],
  ["ב לילה", "בלילה"],
  ["עוד מעטט", "עוד מעט"],
  ["עוד רגעע", "עוד רגע"],
  ["י א ללה", "יאללה"],
  ["יא אללה", "יאללה"],
  ["כוכב ית", "כוכבית"],
  ["כוכב  ית", "כוכבית"],
];

const HEBREW_TOKEN_FIXES: ReadonlyArray<readonly [wrong: string, right: string]> = [
  ["רואי", "רועי"],
  ["רועיי", "רועי"],
  ["גיי", "גיא"],
  ["אידו", "עידו"],
  ["אידן", "עידן"],
  ["איתיי", "איתי"],
  ["נועםם", "נועם"],
  ["אוריי", "אורי"],
  ["יובאל", "יובל"],
  ["יוואל", "יובל"],
  ["מיכלל", "מיכל"],
  ["שירהה", "שירה"],
  ["יעאל", "יעל"],
  ["דאנה", "דנה"],
  ["הילאה", "הילה"],
  ["אסאף", "אסף"],
  ["ליאוור", "ליאור"],
  ["עומרר", "עומר"],
  ["ניירר", "ניר"],
  ["תוםם", "תום"],
  ["נואה", "נועה"],
  ["אביגייל", "אביגיל"],
  ["יונתןן", "יונתן"],
  ["דניאלל", "דניאל"],
  ["מאיהה", "מאיה"],
  ["תזכרת", "תזכורת"],
  ["תזכורתת", "תזכורת"],
  ["תזכוראת", "תזכורת"],
  ["בבקה", "בבקשה"],
  ["בבקשהה", "בבקשה"],
  ["בבקשהא", "בבקשה"],
  ["לקנותת", "לקנות"],
  ["לקנוט", "לקנות"],
  ["להתקשרר", "להתקשר"],
  ["להתקשרה", "להתקשר"],
  ["לשלוחח", "לשלוח"],
  ["לשלח", "לשלוח"],
  ["לדבאר", "לדבר"],
  ["לסייםם", "לסיים"],
  ["לפגושש", "לפגוש"],
  ["בשעב", "בשעה"],
  ["שעהה", "שעה"],
  ["מחרר", "מחר"],
  ["מחרתייםם", "מחרתיים"],
  ["מחרתים", "מחרתיים"],
  ["צהרים", "צהריים"],
  ["צהרייםם", "צהריים"],
  ["בצהרים", "בצהריים"],
  ["אחהצ", "אחה״צ"],
  ["אחצ", "אחה״צ"],
  ["אחה\"צ", "אחה״צ"],
  ["סופש", "סופ״ש"],
  ["סופ\"ש", "סופ״ש"],
  ["סופשש", "סופ״ש"],
  ["בחצותת", "בחצות"],
  ["בסדרר", "בסדר"],
  ["בסדררר", "בסדר"],
  ["יאלה", "יאללה"],
  ["יאללא", "יאללה"],
  ["יאללהה", "יאללה"],
  ["יאלהה", "יאללה"],
  ["סבבא", "סבבה"],
  ["סבבהה", "סבבה"],
  ["סבבהא", "סבבה"],
  ["וואלא", "וואלה"],
  ["וואלהה", "וואלה"],
  ["ואללה", "וואלה"],
  ["תכלסס", "תכלס"],
  ["תכל׳ס", "תכלס"],
  ["תכל'ס", "תכלס"],
  ["אחלא", "אחלה"],
  ["אחלהה", "אחלה"],
  ["אוקי", "אוקיי"],
  ["אוקייי", "אוקיי"],
  ["פדיחה", "פאדיחה"],
  ["פאדיחא", "פאדיחה"],
  ["פאדיחהה", "פאדיחה"],
  ["כייף", "כיף"],
  ["כיףף", "כיף"],
  ["מגנייב", "מגניב"],
  ["מגניבב", "מגניב"],
  ["בואננא", "בואנה"],
  ["בואנהה", "בואנה"],
  ["אחלהל", "אחלה"],
  ["יאלללה", "יאללה"],
  ["כוחבית", "כוכבית"],
  ["כוכביית", "כוכבית"],
  ["כוכביתת", "כוכבית"],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const CLITIC_PREFIX = "([לבכושה]{0,2})";

function replaceTokenForm(text: string, wrong: string, right: string): string {
  const pattern = new RegExp(
    `(?<![\\u0590-\\u05FF])${CLITIC_PREFIX}${escapeRegExp(wrong)}(?![\\u0590-\\u05FF])`,
    "g",
  );
  return text.replace(pattern, `$1${right}`);
}

function replacePhrase(text: string, wrong: string, right: string): string {
  const pattern = new RegExp(
    `(?<![\\u0590-\\u05FF])${escapeRegExp(wrong)}(?![\\u0590-\\u05FF])`,
    "g",
  );
  return text.replace(pattern, right);
}

function normalizeWhitespaceAndMarks(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[״""]/g, "״")
    .replace(/[׳']/g, "׳")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n+ */g, "\n")
    .trim();
}

/**
 * Apply safe Hebrew ASR spelling corrections (names, slang, ktiv male,
 * clitic splits, clear homophones). Idempotent; safe to run before and after AI proofread.
 */
export function applyHebrewAsrSpellingFixes(text: string): string {
  if (!text.trim()) return text;
  let out = normalizeWhitespaceAndMarks(text);
  for (const [wrong, right] of HEBREW_PHRASE_FIXES) {
    out = replacePhrase(out, wrong, right);
  }
  for (const [wrong, right] of HEBREW_TOKEN_FIXES) {
    out = replaceTokenForm(out, wrong, right);
  }
  return normalizeWhitespaceAndMarks(out);
}
