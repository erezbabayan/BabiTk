import { addZonedDays, getZonedParts, zonedLocalToIso } from "../utils/timezone.js";
import {
  getReminderRecurrence,
  nextActiveDueDate,
} from "./reminderRecurrence.js";

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

const QUERY_HINT =
  /(?:מה|משימ|יש לי|יש לנו|רשימ|תיב(?:ה|ת)|inbox|תזכור|agenda|today|tomorrow)/iu;

const MENU_REQUEST_RE =
  /^(?:תפריט|עזרה|help|\?|מה אפשר(?:\s+לשאול)?|שאלות(?:\s+מובנות)?|שאלה|menu|אפשרויות|מה את(?:ה|ם) יודע(?:ים)?|מה המערכת יכולה)$/iu;

const DAY_TOMORROW = /(?:מחר(?:תיים)?|tomorrow)/iu;
const DAY_OVERDUE =
  /(?:ב?איחור|שעבר(?:ו)?\s*זמנ|overdue|פג(?:ה|ו)\s*המועד|(?:ש)?(?:ה)?תארי[ךכל]\s+של(?:הם|הן|ה|ו)?\s+עבר|(?:ש)?(?:ה)?תארי[ךכל].{0,32}עבר|עבר(?:ו)?\s*(?:ה)?תארי[ךכל])/iu;
const DAY_INBOX = /(?:תיב(?:ה|ת)\s*הכניסה|בתיבה|inbox|עדיין לא אושר)/iu;
const DAY_WEEK =
  /(?:השבוע(?:\s+הקרוב)?|שבוע\s+הבא|לשבוע\s+הבא|בשבוע\s+הבא|this week|next week|7 ימים)/iu;
const DAY_PLAN = /(?:תכנ(?:ן|ני)\s+לי\s+את\s+היום|סדר לי את היום|plan my day)/iu;

export function isWhatsAppMenuRequest(raw: string): boolean {
  return MENU_REQUEST_RE.test(raw.trim());
}

/** Number / query: payload after «תפריט». Labels like «מה יש לי היום» need בבי. */
export function isBareWhatsAppMenuPick(raw: string): boolean {
  const text = raw.trim();
  return /^(?:1[0-2]|[1-9])$/.test(text) || /^query:[a-z]+(?::.+)?$/i.test(text);
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

export function parseMenuSelection(
  raw: string,
  menu: MenuQuestion[],
): WhatsAppQuery | null {
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
    const tag = payload[2]?.trim() || null;
    return { type: "query", day, tag };
  }

  const numbered = text.match(/^(1[0-2]|[1-9])$/);
  if (numbered) {
    const hit = menu.find((row) => row.number === Number(numbered[1]));
    return hit?.query ?? null;
  }

  const byLabel = menu.find(
    (row) => row.label === text || row.label.replace(/^מה יש לי /, "") === text,
  );
  return byLabel?.query ?? null;
}

export function buildWhatsAppMenuText(menu: MenuQuestion[]): string {
  const lines = menu.map((row) => `${row.number}. ${row.label}`);
  return (
    `אפשר לשאול אותי שאלות מובנות — אמרו «בבי» ואז השאלה, או הקלידו מספר:\n` +
    `${lines.join("\n")}\n\n` +
    `שאלה: «בבי מה המשימות מחר בעבודה»\n` +
    `משימה חדשה: בלי בבי, למשל «תכניס משימה יום רביעי שבוע הבא»\n` +
    `לסימון משימה מהרשימה: «בוצע 1»`
  );
}

export function parseWhatsAppQuery(
  raw: string,
  allowedTags: string[] = [],
): WhatsAppQuery | null {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text || text.length > 180) return null;
  const fromMenu = parseMenuSelection(text, builtInMenuQuestions(allowedTags));
  if (fromMenu) return fromMenu;
  if (DAY_PLAN.test(text)) {
    return { type: "query", day: "plan", tag: extractQueryTag(text, allowedTags) };
  }
  if (!QUERY_HINT.test(text)) return null;
  // Capture commands like "בוצע" / "דחה שעתיים" are not questions.
  if (/^(?:בוצע|סיימתי|דחה|snooze|done)\b/iu.test(text)) return null;

  let day: BriefingDay = "today";
  if (DAY_PLAN.test(text)) day = "plan";
  else if (DAY_INBOX.test(text)) day = "inbox";
  else if (DAY_OVERDUE.test(text)) day = "overdue";
  else if (DAY_WEEK.test(text)) day = "week";
  else if (DAY_TOMORROW.test(text)) day = "tomorrow";

  const tag = extractQueryTag(text, allowedTags);
  return { type: "query", day, tag };
}

function extractQueryTag(text: string, allowedTags: string[]): string | null {
  const hash = text.match(/#([\u0590-\u05FFa-zA-Z0-9_-]+)/u);
  if (hash) {
    return matchAllowedTag(hash[1]!, allowedTags) ?? hash[1]!;
  }

  const field = text.match(
    /(?:בתחום|בנושא|תג(?:ית)?|של)\s+([\u0590-\u05FF]{2,20}|[\w-]{2,20})/u,
  );
  if (field) {
    return matchAllowedTag(field[1]!, allowedTags) ?? field[1]!;
  }

  const prefixed = text.match(/\bב([\u0590-\u05FF]{2,20})\b/u);
  if (prefixed) {
    const hit = matchAllowedTag(prefixed[1]!, allowedTags);
    if (hit) return hit;
  }

  for (const tag of allowedTags) {
    if (tag.length >= 2 && text.includes(tag)) return tag;
  }
  return null;
}

function matchAllowedTag(raw: string, allowedTags: string[]): string | null {
  const needle = raw.replace(/^#/, "").trim();
  if (!needle) return null;
  const exact = allowedTags.find((tag) => tag === needle || tag === `ב${needle}`);
  if (exact) return exact;
  const lower = needle.toLowerCase();
  return (
    allowedTags.find(
      (tag) =>
        tag.toLowerCase() === lower ||
        tag.includes(needle) ||
        needle.includes(tag),
    ) ?? null
  );
}

export function calendarDayBounds(
  dayOffset: number,
  now = new Date(),
  timezone = "Asia/Jerusalem",
): { start: string; end: string } {
  const start = addZonedDays(timezone, now, dayOffset, 0, 0);
  const next = addZonedDays(timezone, now, dayOffset + 1, 0, 0);
  return { start, end: next };
}

export function itemMatchesBriefingDay(
  item: { due_date: string | null; status?: string; metadata?: unknown },
  day: BriefingDay,
  now = new Date(),
  timezone = "Asia/Jerusalem",
): boolean {
  if (day === "inbox") {
    return item.status === "inbox";
  }
  const dueIso = nextActiveDueDate(item, now, timezone);
  const ts = dueIso ? Date.parse(dueIso) : NaN;
  if (!Number.isFinite(ts)) return false;
  if (day === "overdue") {
    if (getReminderRecurrence(item.metadata)) return false;
    const todayStart = Date.parse(addZonedDays(timezone, now, 0, 0, 0));
    return ts < todayStart;
  }
  if (day === "week") {
    const start = Date.parse(addZonedDays(timezone, now, 0, 0, 0));
    const end = Date.parse(addZonedDays(timezone, now, 7, 0, 0));
    return ts >= start && ts < end;
  }
  const offset = day === "tomorrow" ? 1 : 0;
  const { start, end } = calendarDayBounds(offset, now, timezone);
  return ts >= Date.parse(start) && ts < Date.parse(end);
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
  const hay = `${item.title ?? ""} ${item.content ?? ""}`;
  return hay.includes(tag);
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
  items: Array<{
    title: string;
    due_date?: string | null;
    tags?: string[] | null;
    metadata?: unknown;
  }>,
  query: WhatsAppQuery,
  timezone = "Asia/Jerusalem",
): string {
  const scope = DAY_LABEL[query.day];
  const tagBit = query.tag ? ` ב«${query.tag}»` : "";
  if (items.length === 0) {
    return `אין משימות ${scope}${tagBit}.${BRIEFING_FOOTER}`;
  }

  const now = new Date();
  const lines = items.slice(0, 20).map((item, index) => {
    const dueIso =
      nextActiveDueDate(
        { due_date: item.due_date ?? null, metadata: item.metadata },
        now,
        timezone,
      ) ?? item.due_date;
    const time = formatDueClock(dueIso, timezone);
    const tags =
      item.tags && item.tags.length > 0 ? ` · ${item.tags.slice(0, 2).join(", ")}` : "";
    return `${index + 1}. ${item.title}${time ? ` (${time})` : ""}${tags}`;
  });
  const extra =
    items.length > 20 ? `\n…ועוד ${items.length - 20}` : "";
  const noun = items.length === 1 ? "משימה" : "משימות";
  const heading =
    query.day === "plan"
      ? `🗓 תכנון ליום${tagBit} — ${items.length} ${noun}:`
      : `📋 ${items.length} ${noun} ${scope}${tagBit}:`;
  return `${heading}\n${lines.join("\n")}${extra}${BRIEFING_FOOTER}`;
}

function formatDueClock(dueDate: string | null | undefined, timezone: string): string | null {
  if (!dueDate) return null;
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return null;
  const parts = getZonedParts(date, timezone);
  if (parts.hour === 0 && parts.minute === 0) return null;
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function isSystemWhatsAppReply(text: string): boolean {
  const t = text.trim();
  return (
    t.startsWith("BabiTk") ||
    t.startsWith("נפתחו ") ||
    t.startsWith("קלטתי") ||
    t.startsWith("📋") ||
    t.startsWith("⏰ תזכורת") ||
    t.startsWith("🗓") ||
    t.startsWith("בוקר טוב") ||
    t.startsWith("אין משימות") ||
    t.startsWith("סומן כבוצע") ||
    t.startsWith("נדחה ל-") ||
    t.startsWith("עודכן ל-") ||
    t.includes("השב:") ||
    t.startsWith("הגעת למכסת") ||
    t.startsWith("אפשר לשאול אותי") ||
    t.startsWith("בקבוצה הזו אפשר") ||
    t.includes("לא נרשם פריט")
  );
}

/** Keep zonedLocalToIso imported for tree-shaking-friendly tests that mock timezone. */
void zonedLocalToIso;
