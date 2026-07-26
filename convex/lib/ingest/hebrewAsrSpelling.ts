/**
 * Deterministic Hebrew ASR spelling fixes — especially proper names that
 * Whisper often writes with the wrong letters (רואי → רועי).
 *
 * Keep in sync with backend/src/lib/ingest/hebrewAsrSpelling.ts
 */

/** Whisper vocabulary bias: common Hebrew first names with correct spelling. */
export const HEBREW_ASR_WHISPER_PROMPT =
  "עברית. שמות פרטיים נפוצים: רועי, נועם, אורי, גיא, עידו, עידן, מיכל, שירה, יעל, דנה, מאיה, הילה, אסף, ליאור, יונתן, דניאל, תום, רן, ניר, עומר, איתי, אביה, תמר, נועה, אביגיל.";

/**
 * ASR often picks a phonetic-but-wrong spelling. Map only high-confidence
 * confusions where the wrong form is rarely the intended person's name.
 */
const HEBREW_ASR_NAME_FIXES: ReadonlyArray<readonly [wrong: string, right: string]> = [
  ["רואי", "רועי"],
  ["רועיי", "רועי"],
  ["גיי", "גיא"],
  ["אידו", "עידו"],
  ["אידן", "עידן"],
  ["איתיי", "איתי"],
  ["נועםם", "נועם"],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace a wrong spelling, preserving common Hebrew clitics (לרואי → לרועי).
 */
function replaceNameForm(text: string, wrong: string, right: string): string {
  const pattern = new RegExp(
    `(?<![\\u0590-\\u05FF])([לבכושה]{0,2})${escapeRegExp(wrong)}(?![\\u0590-\\u05FF])`,
    "g",
  );
  return text.replace(pattern, `$1${right}`);
}

/**
 * Apply safe Hebrew ASR spelling corrections (names + clear homophones).
 * Idempotent; safe to run before and after AI proofread.
 */
export function applyHebrewAsrSpellingFixes(text: string): string {
  let out = text;
  for (const [wrong, right] of HEBREW_ASR_NAME_FIXES) {
    out = replaceNameForm(out, wrong, right);
  }
  return out;
}
