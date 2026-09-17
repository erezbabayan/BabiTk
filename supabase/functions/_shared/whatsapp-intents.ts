/** Canned WhatsApp group questions + reply commands for the live Green-API webhook. */

export type BriefingDay = "today" | "tomorrow" | "overdue" | "inbox" | "week" | "plan";

export type WhatsAppQuery = {
  type: "query";
  day: BriefingDay;
  tag: string | null;
};

export type MenuQuestion = {
  id: string;
  number: number;
  label: string;
  query: WhatsAppQuery;
};

export type WhatsAppCommandAction =
  | { type: "complete"; index: number | null; itemId?: string }
  | { type: "snooze"; index: number | null; itemId?: string; hours: number }
  | { type: "tomorrow"; index: number | null; itemId?: string; hour: number };

const QUERY_HINT =
  /(?:מה|משימ|יש לי|יש לנו|רשימ|תיב(?:ה|ת)|inbox|תזכור|agenda|today|tomorrow)/iu;
const MENU_REQUEST_RE =
  /^(?:תפריט|עזרה|help|\?|מה אפשר(?:\s+לשאול)?|שאלות(?:\s+מובנות)?|שאלה|menu|אפשרויות|מה את(?:ה|ם) יודע(?:ים)?|מה המערכת יכולה)$/iu;
const DAY_TOMORROW = /(?:מחר(?:תיים)?|tomorrow)/iu;
const DAY_OVERDUE = /(?:באיחור|שעבר(?:ו)?\s*זמנ|overdue|פג(?:ה|ו)\s*המועד)/iu;
const DAY_INBOX = /(?:תיב(?:ה|ת)\s*הכניסה|בתיבה|inbox|עדיין לא אושר)/iu;
const DAY_WEEK = /(?:השבוע|השבוע הקרוב|this week|7 ימים)/iu;
const DAY_PLAN = /(?:תכנ(?:ן|ני)\s+לי\s+את\s+היום|סדר לי את היום|plan my day)/iu;
const DONE_RE = /^(?:בוצע|סיימתי|סיום|done|complete)(?:\s+(\d+))?$/iu;
const SNOOZE_HOURS_RE = /^(?:דחה|snooze)\s+(?:ל-?)?(\d+)\s*שע(?:ות|ה)?$/iu;
const SNOOZE_RE =
  /^(?:דחה|דחייה|snooze)(?:\s+(\d+))?(?:\s+(?:שעתיים|2h|2 שעות))?$/iu;
const TOMORROW_RE =
  /^(?:מחר)(?:\s+(\d+))?(?:\s*(?:ב-?)?(\d{1,2})(?::(\d{2}))?)?$/iu;
const NUMBERED_DONE_RE = /^(\d+)\s*(?:בוצע|סיימתי|done)$/iu;
const NUMBERED_SNOOZE_RE = /^(\d+)\s*(?:דחה|snooze)(?:\s+שעתיים)?$/iu;
const PAYLOAD_RE = /^(done|snooze2h|tomorrow)(?::([0-9a-fA-F-]{4,}))?$/i;

const TIMEZONE = "Asia/Jerusalem";

export function isWhatsAppMenuRequest(raw: string): boolean {
  return MENU_REQUEST_RE.test(raw.trim());
}

export function builtInMenuQuestions(allowedTags: string[] = []): MenuQuestion[] {
  const items: MenuQuestion[] = [
    { id: "today", number: 1, label: "מה יש לי היום", query: { type: "query", day: "today", tag: null } },
    { id: "tomorrow", number: 2, label: "מה יש לי מחר", query: { type: "query", day: "tomorrow", tag: null } },
    { id: "overdue", number: 3, label: "משימות באיחור", query: { type: "query", day: "overdue", tag: null } },
    { id: "inbox", number: 4, label: "מה בתיבה", query: { type: "query", day: "inbox", tag: null } },
    { id: "week", number: 5, label: "משימות השבוע", query: { type: "query", day: "week", tag: null } },
    { id: "plan", number: 6, label: "תכנן לי את היום", query: { type: "query", day: "plan", tag: null } },
  ];
  const work = allowedTags.find((tag) => tag === "עבודה");
  const studies = allowedTags.find((tag) => tag === "לימודים");
  if (work) {
    items.push({
      id: "today-work",
      number: items.length + 1,
      label: "עבודה היום",
      query: { type: "query", day: "today", tag: work },
    });
    items.push({
      id: "tomorrow-work",
      number: items.length + 1,
      label: "עבודה מחר",
      query: { type: "query", day: "tomorrow", tag: work },
    });
  }
  if (studies) {
    items.push({
      id: "today-studies",
      number: items.length + 1,
      label: "לימודים היום",
      query: { type: "query", day: "today", tag: studies },
    });
    items.push({
      id: "tomorrow-studies",
      number: items.length + 1,
      label: "לימודים מחר",
      query: { type: "query", day: "tomorrow", tag: studies },
    });
  }
  return items;
}

export function parseMenuSelection(raw: string, menu: MenuQuestion[]): WhatsAppQuery | null {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return null;
  const payload = text.match(/^query:([a-z]+)(?::(.+))?$/i);
  if (payload) {
    const dayRaw = payload[1]!.toLowerCase();
    const day: BriefingDay =
      dayRaw === "tomorrow" ||
      dayRaw === "overdue" ||
      dayRaw === "inbox" ||
      dayRaw === "week" ||
      dayRaw === "plan"
        ? dayRaw
        : "today";
    return { type: "query", day, tag: payload[2]?.trim() || null };
  }
  const numbered = text.match(/^(1[0-2]|[1-9])$/);
  if (numbered) {
    return menu.find((row) => row.number === Number(numbered[1]))?.query ?? null;
  }
  const byLabel = menu.find(
    (row) => row.label === text || row.label.replace(/^מה יש לי /, "") === text,
  );
  return byLabel?.query ?? null;
}

export function buildWhatsAppMenuText(menu: MenuQuestion[]): string {
  const lines = menu.map((row) => `${row.number}. ${row.label}`);
  return (
    `אפשר לשאול אותי שאלות מובנות — הקלידו מספר או את השאלה:\n` +
    `${lines.join("\n")}\n\n` +
    `או כתבו חופשי, למשל: «מה המשימות מחר בעבודה»\n` +
    `לסימון משימה מהרשימה: «בוצע 1»`
  );
}

function extractQueryTag(text: string, allowedTags: string[]): string | null {
  const hash = text.match(/#([\u0590-\u05FFa-zA-Z0-9_-]+)/u);
  if (hash) {
    return allowedTags.find((tag) => tag === hash[1]) ?? hash[1]!;
  }
  for (const tag of allowedTags) {
    if (tag.length >= 2 && text.includes(tag)) return tag;
  }
  return null;
}

export function parseWhatsAppQuery(raw: string, allowedTags: string[] = []): WhatsAppQuery | null {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text || text.length > 180) return null;
  const fromMenu = parseMenuSelection(text, builtInMenuQuestions(allowedTags));
  if (fromMenu) return fromMenu;
  if (DAY_PLAN.test(text)) {
    return { type: "query", day: "plan", tag: extractQueryTag(text, allowedTags) };
  }
  if (!QUERY_HINT.test(text)) return null;
  if (/^(?:בוצע|סיימתי|דחה|snooze|done)\b/iu.test(text)) return null;
  let day: BriefingDay = "today";
  if (DAY_INBOX.test(text)) day = "inbox";
  else if (DAY_OVERDUE.test(text)) day = "overdue";
  else if (DAY_WEEK.test(text)) day = "week";
  else if (DAY_TOMORROW.test(text)) day = "tomorrow";
  return { type: "query", day, tag: extractQueryTag(text, allowedTags) };
}

export function parseWhatsAppCommand(raw: string): WhatsAppCommandAction | null {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return null;
  const payload = text.match(PAYLOAD_RE);
  if (payload) {
    const kind = payload[1]!.toLowerCase();
    const itemId = payload[2];
    if (kind === "done") return { type: "complete", index: null, itemId };
    if (kind === "snooze2h") return { type: "snooze", index: null, itemId, hours: 2 };
    return { type: "tomorrow", index: null, itemId, hour: 9 };
  }
  const numberedDone = text.match(NUMBERED_DONE_RE);
  if (numberedDone) return { type: "complete", index: Number(numberedDone[1]) };
  const numberedSnooze = text.match(NUMBERED_SNOOZE_RE);
  if (numberedSnooze) {
    return { type: "snooze", index: Number(numberedSnooze[1]), hours: 2 };
  }
  const done = text.match(DONE_RE);
  if (done) return { type: "complete", index: done[1] ? Number(done[1]) : null };
  const snoozeHours = text.match(SNOOZE_HOURS_RE);
  if (snoozeHours) return { type: "snooze", index: null, hours: Number(snoozeHours[1]) };
  const snooze = text.match(SNOOZE_RE);
  if (snooze) {
    return { type: "snooze", index: snooze[1] ? Number(snooze[1]) : null, hours: 2 };
  }
  const tomorrow = text.match(TOMORROW_RE);
  if (tomorrow) {
    const maybeIndex = tomorrow[1] ? Number(tomorrow[1]) : null;
    if (maybeIndex !== null && maybeIndex >= 1 && maybeIndex <= 20 && !tomorrow[2]) {
      return { type: "tomorrow", index: maybeIndex, hour: 9 };
    }
    const hour = tomorrow[2] ? Number(tomorrow[2]) : 9;
    return { type: "tomorrow", index: null, hour: hour >= 0 && hour <= 23 ? hour : 9 };
  }
  return null;
}

export function resolveCommandItemId(
  command: WhatsAppCommandAction,
  lastItemIds: string[],
): string | null {
  if (command.itemId) return command.itemId;
  if (lastItemIds.length === 0) return null;
  if (command.index === null) return lastItemIds[0] ?? null;
  return lastItemIds[command.index - 1] ?? null;
}

export function buildCaptureConfirmation(items: Array<{ title: string }>): string {
  if (items.length === 0) {
    return "קלטתי, אבל לא נוצרו פריטים. נסו לנסח מחדש.";
  }
  const lines = items.map((item, i) => `${i + 1}. ${item.title}`);
  const noun = items.length === 1 ? "פריט" : "פריטים";
  return (
    `נפתחו ${items.length} ${noun} בתיבה:\n` +
    `${lines.join("\n")}\n\n` +
    `השב:\n` +
    `• בוצע / בוצע 1\n` +
    `• דחה שעתיים\n` +
    `• מחר\n` +
    `• תפריט — שאלות מובנות (מה יש היום / מחר / עבודה)`
  );
}

export { isSystemWhatsAppReply } from "./green-api.ts";

function jerusalemYmd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addCalendarDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day! + days));
  return utc.toISOString().slice(0, 10);
}

export function itemMatchesBriefingDay(
  item: { due_date: string | null; status?: string },
  day: BriefingDay,
  now = new Date(),
): boolean {
  if (day === "inbox") return item.status === "inbox";
  if (!item.due_date) return false;
  const due = new Date(item.due_date);
  if (Number.isNaN(due.getTime())) return false;
  const today = jerusalemYmd(now);
  const dueDay = jerusalemYmd(due);
  if (day === "overdue") return dueDay < today;
  if (day === "week") {
    const end = addCalendarDays(today, 7);
    return dueDay >= today && dueDay < end;
  }
  const target = day === "tomorrow" ? addCalendarDays(today, 1) : today;
  return dueDay === target;
}

export function itemMatchesQueryTag(
  item: { tags?: string[] | null; title?: string; content?: string },
  tag: string | null,
): boolean {
  if (!tag) return true;
  const tags = item.tags ?? [];
  if (tags.some((row) => row === tag || row.includes(tag) || tag.includes(row))) {
    return true;
  }
  return `${item.title ?? ""} ${item.content ?? ""}`.includes(tag);
}

function formatDueClock(dueDate: string | null | undefined): string | null {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  if (hour === 0 && minute === 0) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const DAY_LABEL: Record<BriefingDay, string> = {
  today: "היום",
  tomorrow: "מחר",
  overdue: "באיחור",
  inbox: "בתיבה",
  week: "השבוע",
  plan: "לתכנון היום",
};

const BRIEFING_FOOTER = `\n\nהשב «בוצע 1» לסימון · «תפריט» לשאלות מובנות`;

export function buildTaskBriefing(
  items: Array<{ title: string; due_date?: string | null; tags?: string[] | null }>,
  query: WhatsAppQuery,
): string {
  const scope = DAY_LABEL[query.day];
  const tagBit = query.tag ? ` ב«${query.tag}»` : "";
  if (items.length === 0) return `אין משימות ${scope}${tagBit}.${BRIEFING_FOOTER}`;
  const lines = items.slice(0, 20).map((item, index) => {
    const time = formatDueClock(item.due_date);
    const tags =
      item.tags && item.tags.length > 0 ? ` · ${item.tags.slice(0, 2).join(", ")}` : "";
    return `${index + 1}. ${item.title}${time ? ` (${time})` : ""}${tags}`;
  });
  const extra = items.length > 20 ? `\n…ועוד ${items.length - 20}` : "";
  const noun = items.length === 1 ? "משימה" : "משימות";
  const heading =
    query.day === "plan"
      ? `🗓 תכנון ליום${tagBit} — ${items.length} ${noun}:`
      : `📋 ${items.length} ${noun} ${scope}${tagBit}:`;
  return `${heading}\n${lines.join("\n")}${extra}${BRIEFING_FOOTER}`;
}

export function addHoursIso(hours: number, now = new Date()): string {
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function tomorrowAtHourIso(hour: number, now = new Date()): string {
  const today = jerusalemYmd(now);
  const next = addCalendarDays(today, 1);
  const [year, month, day] = next.split("-").map(Number);
  // Approximate Asia/Jerusalem offset (+03 in September).
  const utc = Date.UTC(year!, month! - 1, day!, hour - 3, 0, 0);
  return new Date(utc).toISOString();
}

export function formatClockFromIso(iso: string): string {
  return formatDueClock(iso) ?? iso;
}

export function replyChatId(message: { senderId?: string; chatId: string; senderPhone?: string }): string {
  if (message.chatId.endsWith("@g.us")) return message.chatId;
  if (message.chatId.endsWith("@c.us") || message.chatId.endsWith("@lid")) {
    return message.chatId;
  }
  const digits = (message.senderPhone ?? "").replace(/\D/g, "");
  return digits ? `${digits}@c.us` : message.chatId;
}
