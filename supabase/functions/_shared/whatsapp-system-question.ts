/**
 * WhatsApp capture-group system questions.
 *
 * Regular messages ingest as a task or note. A message that starts with *,
 * ＊, ?, ؟, spoken «בבי» / «babi», or «שאלה למערכת» is answered in the same chat
 * and must not create a board item.
 */

export const WHATSAPP_SYSTEM_QUESTION_TIMEZONE = "Asia/Jerusalem";
export const WHATSAPP_SYSTEM_QUESTION_ITEM_CAP = 8;

export type SystemQuestionParse =
  | { kind: "none" }
  | { kind: "help" }
  | { kind: "question"; question: string };

export type SystemQuestionItem = {
  title: string;
  content: string;
  isActionable: boolean;
  dueDate: string | null;
  tags?: string[] | null;
  status?: string | null;
};

const BIDI_MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const INVISIBLE = /[\u200b\u200c\u200d\u2060\ufeff]/g;

const STAR_PREFIX = /^(?:[*＊✳️])\s*/u;
const STAR_WRAP = /^(?:[*＊✳️])\s*(.*?)\s*(?:[*＊✳️])$/su;
const STAR_SUFFIX = /^(.*\S)\s+[*＊✳️]$/u;
const QMARK_PREFIX = /^[?؟]\s*/u;
const BABI_WORD = "(?:babitk|babi|baby|בביי|באבי|בבי)";
const BABI_PREFIX = new RegExp(`^${BABI_WORD}(?:\\s*[-–—:.,;!?؟]\\s*|\\s+|$)`, "iu");
const BABI_SUFFIX = new RegExp(`^(.*\\S)\\s+${BABI_WORD}$`, "iu");
const BABI_HEAD_TOKEN = /^(?:babitk|babi|baby|בביי|באבי|בבי)$/iu;
const EXPLICIT_PREFIX = /^(?:שאלה\s+למערכת)(?:\s*[:.,;!?؟\-–—])?\s*/iu;
const VOICE_FILLER_PREFIX =
  /^(?:(?:אה+|אמ+|המ+|אם+|אוקיי?|יאללה|סבבה|וואלה|טוב|כן|אז|זה|בבקשה|רגע|תגידי|תגיד|תראי|תראה|או+|em+|um+|uh+|hmm+)[.,!?،]?\s+)+/iu;

const STOPWORDS = new Set([
  "מה",
  "יש",
  "לי",
  "שלי",
  "את",
  "ה",
  "ב",
  "ל",
  "על",
  "עם",
  "אם",
  "או",
  "זה",
  "זאת",
  "אלה",
  "אלו",
  "אני",
  "תגיד",
  "תגידי",
  "תראי",
  "תראה",
  "בבקשה",
  "למערכת",
  "שאלה",
  "פתוח",
  "פתוחה",
  "פתוחים",
  "פתוחות",
  "היום",
  "להיום",
  "משימות",
  "משימה",
  "הערות",
  "הערה",
  "לעשות",
  "סיכום",
  "רשימה",
  "של",
  "כל",
  "כולם",
  "the",
  "a",
  "to",
  "my",
  "is",
  "are",
  "what",
  "do",
  "i",
]);

export function normalizeWhatsAppQuestionSource(text: string): string {
  return text.replace(BIDI_MARKS, "").replace(INVISIBLE, "").replace(/^\s+|\s+$/g, "");
}

function restOrHelp(rest: string): SystemQuestionParse {
  return rest ? { kind: "question", question: rest } : { kind: "help" };
}

function stripKnownPrefix(text: string): string | null {
  if (STAR_PREFIX.test(text)) return text.replace(STAR_PREFIX, "").trim();
  if (QMARK_PREFIX.test(text)) return text.replace(QMARK_PREFIX, "").trim();
  if (BABI_PREFIX.test(text)) return text.replace(BABI_PREFIX, "").trim();
  if (EXPLICIT_PREFIX.test(text)) return text.replace(EXPLICIT_PREFIX, "").trim();
  return null;
}

export function parseWhatsAppSystemQuestion(text: string): SystemQuestionParse {
  const trimmed = normalizeWhatsAppQuestionSource(text);
  if (!trimmed) return { kind: "none" };

  const wrapped = trimmed.match(STAR_WRAP);
  if (wrapped) {
    const inner = wrapped[1]?.trim() ?? "";
    const innerPrefixed = stripKnownPrefix(inner);
    if (innerPrefixed !== null) return restOrHelp(innerPrefixed);
    return restOrHelp(inner);
  }

  const prefixed = stripKnownPrefix(trimmed);
  if (prefixed !== null) return restOrHelp(prefixed);

  const suffixStar = trimmed.match(STAR_SUFFIX);
  if (suffixStar && !/[*＊✳️]/.test(suffixStar[1] ?? "")) {
    return restOrHelp(suffixStar[1]?.trim() ?? "");
  }
  const suffixBabi = trimmed.match(BABI_SUFFIX);
  if (suffixBabi) {
    return restOrHelp(suffixBabi[1]?.trim() ?? "");
  }

  return { kind: "none" };
}

export function isWhatsAppSystemQuestion(text: string): boolean {
  return parseWhatsAppSystemQuestion(text).kind !== "none";
}

function joinAsrBabi(text: string): string {
  return text
    .replace(/\bbabi\s*tk\b/giu, "בבי")
    .replace(/\bbabitk\b/giu, "בבי")
    .replace(/\bbaby\b/giu, "בבי")
    .replace(/\bbabi\b/giu, "בבי")
    .replace(/ב\s+בי(?![\u0590-\u05FF])/giu, "בבי")
    .replace(/(?<![\u0590-\u05FF])(?:באבי|בביי)(?![\u0590-\u05FF])/giu, "בבי");
}

/** Strip spoken fillers and ASR splits so a recorded «בבי» still parses. */
export function normalizeSpokenWhatsAppQuestion(text: string): string {
  const joined = joinAsrBabi(normalizeWhatsAppQuestionSource(text));
  return joined.replace(VOICE_FILLER_PREFIX, "").trim();
}

function babiInHead(text: string): SystemQuestionParse {
  const words = text.split(/\s+/).filter(Boolean);
  const headLimit = Math.min(words.length, 3);
  for (let index = 0; index < headLimit; index += 1) {
    const token = (words[index] ?? "").replace(/[:.,;!?؟\-–—]+$/u, "");
    if (!BABI_HEAD_TOKEN.test(token)) continue;
    const rest = [...words.slice(0, index), ...words.slice(index + 1)].join(" ").trim();
    return restOrHelp(rest);
  }
  return { kind: "none" };
}

/**
 * Recorded questions: leading fillers («אה בבי…») and Whisper near-misses of
 * «בבי» / «babi» still count as a system question. A trailing ? alone is not
 * enough («לקנות חלב?» stays a task).
 */
export function parseWhatsAppVoiceQuestion(text: string): SystemQuestionParse {
  const spoken = normalizeSpokenWhatsAppQuestion(text);
  if (!spoken) return { kind: "none" };
  const parsed = parseWhatsAppSystemQuestion(spoken);
  if (parsed.kind !== "none") return parsed;
  return babiInHead(spoken);
}

export function isWhatsAppVoiceQuestion(text: string): boolean {
  return parseWhatsAppVoiceQuestion(text).kind !== "none";
}

export function buildWhatsAppSystemQuestionHelp(): string {
  return [
    "BabiTk · שאלה למערכת (לא נרשם פריט)",
    "",
    "הודעה רגילה נכנסת כמשימה או הערה.",
    "שאלה למערכת מתחילה ב-* ואז השאלה, למשל:",
    "* מה יש לי היום",
    "* חלב",
    "",
    "בהקלטה: אמרו «בבי» ואז שאלו, למשל «בבי מה יש לי היום».",
    "אפשר גם babi-מה יש לי היום",
    "בהקלדה אפשר להתחיל ב-* או ב-?.",
  ].join("\n");
}

function localDateKey(value: Date, timeZone = WHATSAPP_SYSTEM_QUESTION_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isDueOnLocalDay(
  dueDate: string | null | undefined,
  now = new Date(),
  timeZone = WHATSAPP_SYSTEM_QUESTION_TIMEZONE,
): boolean {
  if (!dueDate) return false;
  const ms = Date.parse(dueDate);
  if (!Number.isFinite(ms)) return false;
  return localDateKey(new Date(ms), timeZone) === localDateKey(now, timeZone);
}

export function isOverdueOnLocalDay(
  dueDate: string | null | undefined,
  now = new Date(),
  timeZone = WHATSAPP_SYSTEM_QUESTION_TIMEZONE,
): boolean {
  if (!dueDate) return false;
  const ms = Date.parse(dueDate);
  if (!Number.isFinite(ms)) return false;
  return localDateKey(new Date(ms), timeZone) < localDateKey(now, timeZone);
}

const ASKS_OVERDUE =
  /ב?איחור|overdue|פג(?:ה|ו)\s*המועד|שעבר(?:ו)?\s*זמנ|(?:ש)?(?:ה)?תארי[ךכל]\s+של(?:הם|הן|ה|ו)?\s+עבר|(?:ש)?(?:ה)?תארי[ךכל].{0,32}עבר|עבר(?:ו)?\s*(?:ה)?תארי[ךכל]/u;

function searchTokens(question: string): string[] {
  return question
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function itemHaystack(item: SystemQuestionItem): string {
  const tags = Array.isArray(item.tags) ? item.tags.join(" ") : "";
  return `${item.title} ${item.content} ${tags}`.toLowerCase();
}

function matchesQuery(item: SystemQuestionItem, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const haystack = itemHaystack(item);
  return tokens.every((token) => haystack.includes(token));
}

function formatDueLabel(dueDate: string | null | undefined): string | null {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("he-IL", {
    timeZone: WHATSAPP_SYSTEM_QUESTION_TIMEZONE,
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatItemLine(item: SystemQuestionItem): string {
  const kind = item.isActionable ? "משימה" : "הערה";
  const title = item.title.trim() || item.content.trim().slice(0, 80) || "פריט";
  const due = formatDueLabel(item.dueDate);
  return due ? `• ${title} (${kind}, ${due})` : `• ${title} (${kind})`;
}

function takeItems(items: SystemQuestionItem[]): {
  shown: SystemQuestionItem[];
  extra: number;
} {
  const shown = items.slice(0, WHATSAPP_SYSTEM_QUESTION_ITEM_CAP);
  return { shown, extra: Math.max(0, items.length - shown.length) };
}

function renderList(title: string, items: SystemQuestionItem[]): string[] {
  if (items.length === 0) return [];
  const { shown, extra } = takeItems(items);
  const lines = [title, ...shown.map((item) => formatItemLine(item))];
  if (extra > 0) lines.push(`…ועוד ${extra}`);
  return lines;
}

export function answerWhatsAppSystemQuestion(
  parsed: SystemQuestionParse,
  items: SystemQuestionItem[],
  now = new Date(),
): string {
  if (parsed.kind === "none") {
    throw new Error("not_a_system_question");
  }
  if (parsed.kind === "help") {
    return buildWhatsAppSystemQuestionHelp();
  }

  const question = parsed.question;
  const open = items.filter(
    (item) => item.status === "inbox" || item.status === "pending" || !item.status,
  );
  const tokens = searchTokens(question);
  const asksToday = /היום|להיום/.test(question);
  const asksOverdue = ASKS_OVERDUE.test(question);
  const asksNotes = /הערות|הערה|פתקים|פנקס/.test(question) && !/משימ/.test(question);
  const asksTasks = /משימ|לעשות/.test(question) && !/הערות|הערה/.test(question);

  let matched: SystemQuestionItem[] = open;
  let heading = "פתוח אצלך:";

  if (asksOverdue) {
    matched = open.filter(
      (item) => item.isActionable && isOverdueOnLocalDay(item.dueDate, now),
    );
    heading = "משימות באיחור:";
  } else if (asksNotes) {
    matched = open.filter((item) => !item.isActionable);
    heading = "הערות פתוחות:";
  } else if (asksToday) {
    matched = open.filter((item) => isDueOnLocalDay(item.dueDate, now));
    heading = "להיום:";
    if (tokens.length > 0) {
      matched = matched.filter((item) => matchesQuery(item, tokens));
    }
  } else if (asksTasks && tokens.length === 0) {
    matched = open.filter((item) => item.isActionable);
    heading = "משימות פתוחות:";
  } else if (tokens.length > 0) {
    matched = open.filter((item) => matchesQuery(item, tokens));
    heading = `מצאתי ל«${tokens.join(" ")}»:`;
  } else if (/מה\s+יש|סיכום|רשימה|פתוח/.test(question)) {
    const today = open.filter((item) => isDueOnLocalDay(item.dueDate, now));
    const tasks = open.filter((item) => item.isActionable);
    const notes = open.filter((item) => !item.isActionable);
    const lines = [
      "BabiTk · תשובה (לא נרשם פריט)",
      "",
      `שאלה: ${question}`,
    ];
    const todayLines = renderList("להיום:", today);
    const taskLines = renderList("משימות:", tasks);
    const noteLines = renderList("הערות:", notes);
    if (todayLines.length + taskLines.length + noteLines.length === 0) {
      lines.push("", "אין כרגע משימות או הערות פתוחות.");
    } else {
      if (todayLines.length) lines.push("", ...todayLines);
      if (taskLines.length) lines.push("", ...taskLines);
      if (noteLines.length) lines.push("", ...noteLines);
    }
    return lines.join("\n");
  }

  const lines = [
    "BabiTk · תשובה (לא נרשם פריט)",
    "",
    `שאלה: ${question}`,
  ];
  if (matched.length === 0) {
    lines.push(
      "",
      "לא מצאתי משימה או הערה מתאימה.",
      "רשמו בלי בבי (ובלי ?) כדי להוסיף פריט ללוח.",
    );
    return lines.join("\n");
  }
  lines.push("", ...renderList(heading, matched));
  return lines.join("\n");
}
