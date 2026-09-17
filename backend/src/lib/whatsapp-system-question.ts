/**
 * WhatsApp capture-group system questions.
 *
 * Regular messages ingest as a task or note. A message that starts with *,
 * ＊, ?, ؟, spoken «כוכבית», or «שאלה למערכת» is answered in the same chat
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

const STAR_PREFIX = /^(?:[*＊✳️])\s*/u;
const QMARK_PREFIX = /^[?؟]\s*/u;
const KOKHAVIT_PREFIX =
  /^(?:כוכבית|כוכביית|כוחבית|כוכב\s*ית|kokhavit)(?:\s*[:.,;!?؟\-–—])?\s*/iu;
const EXPLICIT_PREFIX = /^(?:שאלה\s+למערכת)(?:\s*[:.,;!?؟\-–—])?\s*/iu;

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
  return text.replace(BIDI_MARKS, "").replace(/^\s+|\s+$/g, "");
}

export function parseWhatsAppSystemQuestion(text: string): SystemQuestionParse {
  const trimmed = normalizeWhatsAppQuestionSource(text);
  if (!trimmed) return { kind: "none" };

  let rest: string | null = null;
  if (STAR_PREFIX.test(trimmed)) {
    rest = trimmed.replace(STAR_PREFIX, "").trim();
  } else if (QMARK_PREFIX.test(trimmed)) {
    rest = trimmed.replace(QMARK_PREFIX, "").trim();
  } else if (KOKHAVIT_PREFIX.test(trimmed)) {
    rest = trimmed.replace(KOKHAVIT_PREFIX, "").trim();
  } else if (EXPLICIT_PREFIX.test(trimmed)) {
    rest = trimmed.replace(EXPLICIT_PREFIX, "").trim();
  }

  if (rest === null) return { kind: "none" };
  if (!rest) return { kind: "help" };
  return { kind: "question", question: rest };
}

export function isWhatsAppSystemQuestion(text: string): boolean {
  return parseWhatsAppSystemQuestion(text).kind !== "none";
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
    "בהקלטה: אמרו «כוכבית» ואז שאלו.",
    "אפשר גם להתחיל ב-? — נוח יותר במקלדת מהכוכבית.",
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
  const lines = [title, ...shown.map(formatItemLine)];
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
  const asksNotes = /הערות|הערה|פתקים|פנקס/.test(question) && !/משימ/.test(question);
  const asksTasks = /משימ|לעשות/.test(question) && !/הערות|הערה/.test(question);

  let matched: SystemQuestionItem[] = open;
  let heading = "פתוח אצלך:";

  if (asksNotes) {
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
      "רשמו בלי כוכבית (ובלי ?) כדי להוסיף פריט ללוח.",
    );
    return lines.join("\n");
  }
  lines.push("", ...renderList(heading, matched));
  return lines.join("\n");
}
