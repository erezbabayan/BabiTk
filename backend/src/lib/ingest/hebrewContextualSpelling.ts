/**
 * Context-sensitive Hebrew spelling.
 *
 * Hspell / hunspell he_IL / LanguageTool only know whether a word exists.
 * Both רעיון (idea, ayin) and ראיון (interview, aleph) are valid — the
 * intended one depends on the phrase. DictaBERT/Nakdan/HebrewNLP can
 * disambiguate with a GPU or an account; this module is the offline
 * high-confidence collocation layer used on every inbound channel
 * (typed, WhatsApp, voice ASR) with no extra API keys.
 *
 * Keep in sync with:
 *   convex/lib/ingest/hebrewContextualSpelling.ts
 */

const HE_BOUNDARY = "(?<![\\u0590-\\u05FF])";
const HE_END = "(?![\\u0590-\\u05FF])";
const CLITIC_ONLY = /^[לבכושה]{0,2}$/;
const KNOWN_STEMS = [
  "רעיונות",
  "ראיונות",
  "מדרשים",
  "מדרסים",
  "רעיון",
  "ראיון",
] as const;

/**
 * Multi-word collocations. Longest first.
 * User example: סיכום רעיון → סיכום ראיון (interview, not idea).
 */
const CONTEXT_PHRASES: ReadonlyArray<readonly [wrong: string, right: string]> = [
  ["סיכום של הרעיון", "סיכום של הראיון"],
  ["סיכום של רעיון", "סיכום של ראיון"],
  ["לסכם את הרעיון", "לסכם את הראיון"],
  ["סיכומי רעיונות", "סיכומי ראיונות"],
  ["סיכום הרעיון", "סיכום הראיון"],
  ["סיכום רעיונות", "סיכום ראיונות"],
  ["סיכום רעיון", "סיכום ראיון"],
  ["לסכם רעיון", "לסכם ראיון"],
  ["קביעת רעיון", "קביעת ראיון"],
  ["קבעתי רעיון", "קבעתי ראיון"],
  ["לקבוע רעיון", "לקבוע ראיון"],
  ["תיאום רעיון", "תיאום ראיון"],
  ["לתאם רעיון", "לתאם ראיון"],
  ["רעיונות עבודה", "ראיונות עבודה"],
  ["רעיון עבודה", "ראיון עבודה"],
  ["רעיון קבלה", "ראיון קבלה"],
  ["לערוך רעיון", "לערוך ראיון"],
  ["לקיים רעיון", "לקיים ראיון"],
  ["עברתי רעיון", "עברתי ראיון"],
  ["זימון רעיון", "זימון ראיון"],
  ["לזמן רעיון", "לזמן ראיון"],
  ["רעיון טלפוני", "ראיון טלפוני"],
  ["רעיון בזום", "ראיון בזום"],
  ["רעיון זום", "ראיון זום"],
  ["עלה לי ראיון", "עלה לי רעיון"],
  ["הגיע לי ראיון", "הגיע לי רעיון"],
  ["ראיון יצירתי", "רעיון יצירתי"],
  ["ראיון מגניב", "רעיון מגניב"],
  ["לברך לגבי", "לברר לגבי"],
  ["בירכתי לגבי", "ביררתי לגבי"],
];

/** Neighbor stems that mean interview, not idea. */
const INTERVIEW_CUES = new Set([
  "סיכום",
  "לסכם",
  "סיכמתי",
  "נסכם",
  "תסכם",
  "קבע",
  "קבעתי",
  "לקבוע",
  "נקבע",
  "קביעה",
  "קביעת",
  "תיאום",
  "לתאם",
  "תואם",
  "עבודה",
  "משרה",
  "מועמד",
  "מועמדת",
  "גיוס",
  "קבלה",
  "טלפוני",
  "זום",
  "zoom",
  "meet",
  "לערוך",
  "לקיים",
  "עברתי",
  "זימון",
  "לזמן",
  "hr",
  "cv",
  "קורות",
  "הייטק",
]);

/** Immediate-right adjectives that keep רעיון = idea. */
const IDEA_RIGHT = new Set([
  "טוב",
  "טובה",
  "טובים",
  "מגניב",
  "מגניבה",
  "חדש",
  "חדשה",
  "יצירתי",
  "יצירתית",
  "גאוני",
  "מעולה",
  "יפה",
]);

const IDEA_LEFT_VERB = new Set(["יש", "עלה", "עלתה", "הגיע", "הגיעה"]);

const IDEA_TO_INTERVIEW: Record<string, string> = {
  רעיון: "ראיון",
  רעיונות: "ראיונות",
};

const INTERVIEW_TO_IDEA: Record<string, string> = {
  ראיון: "רעיון",
  ראיונות: "רעיונות",
};

/** Orthotics (insoles) vs midrashim — payment/shoes ⇒ מדרסים. */
const INSOLE_CUES = new Set([
  "לאסוף",
  "לשלם",
  "שקל",
  "ש״ח",
  "שח",
  "נעליים",
  "נעל",
  "אורתופד",
  "כף",
  "רגל",
  "רגליים",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replacePhrase(text: string, wrong: string, right: string): string {
  const pattern = new RegExp(
    `${HE_BOUNDARY}${escapeRegExp(wrong)}${HE_END}`,
    "g",
  );
  return text.replace(pattern, right);
}

function splitKnownStem(word: string): { prefix: string; stem: string } | null {
  for (const stem of KNOWN_STEMS) {
    if (!word.endsWith(stem)) continue;
    const prefix = word.slice(0, word.length - stem.length);
    if (CLITIC_ONLY.test(prefix)) return { prefix, stem };
  }
  return null;
}

function cueVariants(word: string): string[] {
  const lower = word.toLowerCase();
  const variants = [lower];
  for (let n = 1; n <= 2; n += 1) {
    const prefix = word.slice(0, n);
    const rest = word.slice(n);
    if (CLITIC_ONLY.test(prefix) && rest.length >= 2) {
      variants.push(rest.toLowerCase());
    }
  }
  return variants;
}

function isIdeaLocalContext(tokens: string[], index: number): boolean {
  const right = tokens[index + 1];
  if (right && cueVariants(right).some((key) => IDEA_RIGHT.has(key))) return true;
  const left = tokens[index - 1];
  const left2 = tokens[index - 2];
  if (left === "לי" && left2 && cueVariants(left2).some((key) => IDEA_LEFT_VERB.has(key))) {
    return true;
  }
  return false;
}

function windowHasCue(tokens: string[], index: number, cues: Set<string>, radius = 4): boolean {
  const from = Math.max(0, index - radius);
  const to = Math.min(tokens.length - 1, index + radius);
  for (let i = from; i <= to; i += 1) {
    if (i === index) continue;
    const token = tokens[i];
    if (!token) continue;
    if (cueVariants(token).some((key) => cues.has(key))) return true;
  }
  return false;
}

/**
 * Rewrite רעיון/ראיון (and מדרשים/מדרסים) from neighboring tokens.
 * Prefers leaving the word alone when context is ambiguous.
 */
function rewriteHomophoneTokens(text: string): string {
  const parts = text.split(/([\u0590-\u05FF]+)/);
  const heIndexes: number[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part && /^[\u0590-\u05FF]+$/.test(part)) heIndexes.push(i);
  }
  const tokens = heIndexes.map((i) => parts[i] ?? "");

  for (let t = 0; t < tokens.length; t += 1) {
    const raw = tokens[t];
    if (!raw) continue;
    const known = splitKnownStem(raw);
    const partIndex = heIndexes[t];
    if (partIndex === undefined || !known) continue;
    const { prefix, stem } = known;

    if (stem === "מדרשים" && windowHasCue(tokens, t, INSOLE_CUES, 6)) {
      parts[partIndex] = `${prefix}מדרסים`;
      tokens[t] = parts[partIndex] ?? raw;
      continue;
    }

    if (stem in IDEA_TO_INTERVIEW) {
      if (isIdeaLocalContext(tokens, t)) continue;
      if (windowHasCue(tokens, t, INTERVIEW_CUES)) {
        parts[partIndex] = `${prefix}${IDEA_TO_INTERVIEW[stem]}`;
        tokens[t] = parts[partIndex] ?? raw;
      }
      continue;
    }

    if (stem in INTERVIEW_TO_IDEA && isIdeaLocalContext(tokens, t)) {
      parts[partIndex] = `${prefix}${INTERVIEW_TO_IDEA[stem]}`;
      tokens[t] = parts[partIndex] ?? raw;
    }
  }

  return parts.join("");
}

/**
 * Apply context-aware Hebrew spelling. Idempotent. Safe on non-Hebrew.
 */
export function applyHebrewContextualSpellingFixes(text: string): string {
  if (!text.trim()) return text;
  let out = text;
  for (const [wrong, right] of CONTEXT_PHRASES) {
    out = replacePhrase(out, wrong, right);
  }
  return rewriteHomophoneTokens(out);
}

export { CONTEXT_PHRASES };
