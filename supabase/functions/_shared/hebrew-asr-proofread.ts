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
 *   backend/src/lib/ingest/hebrewAsrSpelling.ts
 *   convex/lib/ingest/hebrewAsrSpelling.ts
 */

/** Vocabulary bias for Whisper / Groq / ivrit.ai turbo. */
export const HEBREW_ASR_WHISPER_PROMPT =
  "עברית מדוברת. משימות יומיום: תכניס משימה, תוסיף הערה, תרשום, לקנות, להתקשר, לשלוח, תזכורת, בבקשה, בבי, babi. " +
  "סלנג: יאללה, סבבה, וואלה, תכלס, אחלה, אוקיי. " +
  "זמנים: היום, להיום, מחר, מחרתיים, שבוע הבא, לשבוע הבא, יום רביעי, בצהריים, אחה״צ, סופ״ש. " +
  "שמות: רועי, נועם, אורי, גיא, עידו, עידן, מיכל, שירה, יעל, דנה, מאיה, הילה, אסף, ליאור, יונתן, דניאל, תום, רן, ניר, עומר, איתי, אביה, תמר, נועה, אביגיל, יובל, נועה.";

/** Append a live/on-device transcript so Groq Whisper biases toward those words. */
export function composeHebrewWhisperPrompt(hint?: string): string {
  const trimmed = hint?.replace(/\s+/g, " ").trim() ?? "";
  if (!trimmed) return HEBREW_ASR_WHISPER_PROMPT;
  return `${HEBREW_ASR_WHISPER_PROMPT} ${trimmed.slice(0, 180)}`;
}

/**
 * Multi-word ASR splits. Longest phrases first.
 * Whisper tokenizes clitics as separate words: "ל קנות", "ב שעה".
 */
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
  ["ב בי", "בבי"],
  ["babi tk", "בבי"],
  ["babi-tk", "בבי"],
  ["ת זכיר", "תזכיר"],
  ["ת רשום", "תרשום"],
  ["ת כניס", "תכניס"],
  ["תו סיף", "תוסיף"],
  ["ל סגור", "לסגור"],
  ["ל בדוק", "לבדוק"],
  ["ל עדכן", "לעדכן"],
  ["ל שלם", "לשלם"],
  ["ב יום", "ביום"],
  ["ל יום", "ליום"],
  ["עוד מ עט", "עוד מעט"],
];

/**
 * Single-token fixes. Applied with Hspell-style clitics: לרואי → לרועי.
 * Only high-confidence confusions where the wrong form is rarely intended.
 */
const HEBREW_TOKEN_FIXES: ReadonlyArray<readonly [wrong: string, right: string]> = [
  // Names
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

  // Everyday verbs / nouns Whisper often misspells
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
  ["תזכירר", "תזכיר"],
  ["תרשוםם", "תרשום"],
  ["לבדוקק", "לבדוק"],
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

  // Israeli slang (spoken WhatsApp / street Hebrew)
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
  ["באבי", "בבי"],
  ["בביי", "בבי"],
  ["babitk", "בבי"],
  ["babi", "בבי"],
  ["baby", "בבי"],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Hspell/HebMorph clitics: up to two of ב/ל/מ/ה/ו/ש/כ before the token. */
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
 * clitic splits, clear homophones). Idempotent.
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

function hasHebrewLetters(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

/**
 * Prefer the hosted ASR text, but keep a live caption if Groq drifted
 * to English or dropped most of the utterance.
 */
function isWhisperPromptLeak(text: string): boolean {
  return /בבי\s+מה\s+המשימות/.test(text) && /תפריט|היום\s+מחר/.test(text);
}

/**
 * Prefer the hosted ASR text, but keep a live caption if Groq drifted
 * to English or dropped most of the utterance.
 * Vocabulary prompts (Whisper `prompt`) must never be passed as `hint`.
 */
export function pickBestHebrewTranscript(primary: string, hint?: string): string {
  const hosted = applyHebrewAsrSpellingFixes(primary).trim();
  const live = applyHebrewAsrSpellingFixes(hint ?? "").trim();
  if (!hosted) return live;
  if (!live) return hosted;
  if (isWhisperPromptLeak(live) && !isWhisperPromptLeak(hosted)) return hosted;
  const hostedHebrew = hasHebrewLetters(hosted);
  const liveHebrew = hasHebrewLetters(live);
  if (hostedHebrew && !liveHebrew) return hosted;
  if (liveHebrew && !hostedHebrew) return live;
  if (
    hostedHebrew &&
    liveHebrew &&
    live.length >= hosted.length * 2 &&
    live.length - hosted.length >= 8
  ) {
    return live;
  }
  return hosted;
}

export { HEBREW_PHRASE_FIXES, HEBREW_TOKEN_FIXES };
