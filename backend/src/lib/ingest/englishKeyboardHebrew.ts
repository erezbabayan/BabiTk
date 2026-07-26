/**
 * Converts text typed on an English (QWERTY) keyboard while intending Hebrew
 * layout — e.g. "nhsg jsa" → "מידע חדש", ",ufbu," → "תזכורת".
 *
 * Keep in sync with convex/lib/ingest/englishKeyboardHebrew.ts
 */

const EN_TO_HE: Record<string, string> = {
  q: "/",
  w: "'",
  e: "ק",
  r: "ר",
  t: "א",
  y: "ט",
  u: "ו",
  i: "ן",
  o: "ם",
  p: "פ",
  a: "ש",
  s: "ד",
  d: "ג",
  f: "כ",
  g: "ע",
  h: "י",
  j: "ח",
  k: "ל",
  l: "ך",
  ";": "ף",
  z: "ז",
  x: "ס",
  c: "ב",
  v: "ה",
  b: "נ",
  n: "מ",
  m: "צ",
  ",": "ת",
  ".": "ץ",
  "/": ".",
  "`": ";",
};

const COMMON_ENGLISH = new Set([
  "the",
  "and",
  "for",
  "you",
  "are",
  "this",
  "that",
  "with",
  "have",
  "from",
  "will",
  "your",
  "what",
  "when",
  "how",
  "can",
  "not",
  "but",
  "all",
  "buy",
  "get",
  "call",
  "send",
  "check",
  "ok",
  "yes",
  "no",
  "hi",
  "hello",
  "hey",
  "thanks",
  "thank",
  "please",
  "meeting",
  "tomorrow",
  "today",
  "yesterday",
  "email",
  "http",
  "https",
  "www",
  "com",
  "org",
  "net",
  "todo",
  "note",
  "task",
  "remind",
  "reminder",
  "message",
  "update",
  "fix",
  "open",
  "close",
  "start",
  "stop",
  "test",
  "demo",
  "app",
  "whatsapp",
  "google",
  "microsoft",
]);

function isLatinLetter(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function isHebrewLetter(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 0x0590 && code <= 0x05ff;
}

function letterCounts(text: string): { latin: number; hebrew: number } {
  let latin = 0;
  let hebrew = 0;
  for (const ch of text) {
    if (isLatinLetter(ch)) latin += 1;
    else if (isHebrewLetter(ch)) hebrew += 1;
  }
  return { latin, hebrew };
}

function mapLatinLayoutToHebrew(text: string): string {
  let out = "";
  for (const ch of text) {
    if (isLatinLetter(ch)) {
      out += EN_TO_HE[ch.toLowerCase()] ?? ch;
      continue;
    }
    out += EN_TO_HE[ch] ?? ch;
  }
  return out;
}

function latinLettersOnly(token: string): string {
  let out = "";
  for (const ch of token) {
    if (isLatinLetter(ch)) out += ch.toLowerCase();
  }
  return out;
}

function shouldKeepEnglishToken(token: string): boolean {
  const letters = latinLettersOnly(token);
  if (!letters) return true;
  if (COMMON_ENGLISH.has(letters)) return true;
  if (/[0-9]/.test(token) && /[a-zA-Z]/.test(token)) return true;
  return false;
}

function convertToken(token: string): string {
  const { latin, hebrew } = letterCounts(token);
  if (latin < 2) return token;
  if (hebrew > 0) return token;
  if (shouldKeepEnglishToken(token)) return token;

  const converted = mapLatinLayoutToHebrew(token);
  const after = letterCounts(converted);
  if (after.hebrew < 2) return token;
  if (after.hebrew < latin * 0.55) return token;
  return converted;
}

export function correctEnglishKeyboardHebrew(text: string): string {
  if (!text) return text;

  if (/https?:\/\//i.test(text) || /@[\w.-]+\.\w+/i.test(text)) {
    return text;
  }

  const { latin, hebrew } = letterCounts(text);
  if (latin < 2) return text;
  if (hebrew >= 3 && hebrew >= latin) return text;

  const parts = text.split(/(\s+)/);
  let convertedTokens = 0;
  let latinTokens = 0;

  const out = parts.map((part) => {
    if (!part || /^\s+$/.test(part)) return part;
    const counts = letterCounts(part);
    if (counts.latin < 2) return part;
    latinTokens += 1;
    const next = convertToken(part);
    if (next !== part) convertedTokens += 1;
    return next;
  });

  if (convertedTokens === 0) return text;
  if (latinTokens >= 3 && convertedTokens / latinTokens < 0.34) return text;

  return out.join("");
}
