/**
 * Pure WhatsApp product logic shared by the API, the Supabase Edge dispatcher,
 * and Convex. No I/O. Keep the three copies identical.
 *
 * Time zone for every proactive send is Asia/Jerusalem.
 */

export const PROACTIVE_TIMEZONE = "Asia/Jerusalem";
export const MAX_PROACTIVE_PER_DAY = 3;
export const DEFAULT_BRIEFING_HOUR = 7;
export const DEFAULT_BRIEFING_MINUTE = 30;
export const DEFAULT_FOLLOWUP_HOUR = 20;
export const DEFAULT_WEEKLY_HOUR = 13;

export function envFlagEnabled(raw: string | undefined | null, defaultOn = true): boolean {
  if (raw == null || raw.trim() === "") return defaultOn;
  const value = raw.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes" || value === "on") return true;
  if (value === "0" || value === "false" || value === "no" || value === "off") return false;
  return defaultOn;
}

/**
 * unset / true / edge: the Supabase Edge cron and the API cron send.
 * convex: only the Convex cron sends, so the two stores are not both used.
 * false / off / 0: no proactive send.
 */
export function proactiveDispatcherMode(raw: string | undefined | null): "edge" | "convex" | "off" {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "convex") return "convex";
  if (value === "0" || value === "false" || value === "no" || value === "off") return "off";
  return "edge";
}

export type RecurrenceKind = "daily" | "weekly" | "monthly" | "weekdays";

export type ChecklistLine = { id: string; text: string; done: boolean };

export type CaptureCard = {
  title: string;
  content: string;
  checklist?: ChecklistLine[];
  recurrence: RecurrenceKind | null;
};

export type CaptureRow = {
  title: string;
  content: string;
  is_actionable: boolean;
  tags: string[];
  due_date: string | null;
  analysis?: unknown;
  reminder_recurrence?: string | null;
  checklist?: ChecklistLine[];
  priority?: "high" | "normal";
};

export type ProactiveTask = {
  id: string;
  title: string;
  dueAt: string | null;
};

export type QuickReply = { id: string; title: string };

export type MoveCommand = { title: string | null; weekday: number };

type Zoned = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function zonedParts(date: Date, timeZone = PROACTIVE_TIMEZONE): Zoned {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";
  const hour = Number(get("hour"));
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: hour === 24 ? 0 : hour,
    minute: Number(get("minute")),
    weekday: WEEKDAY_SHORT[get("weekday")] ?? 0,
  };
}

export function localDateKey(date: Date, timeZone = PROACTIVE_TIMEZONE): string {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function offsetOf(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const offset = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = offset.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  if (!match) return "+00:00";
  const sign = match[1]!.startsWith("-") ? "-" : "+";
  const hourNum = Math.abs(Number.parseInt(match[1]!, 10));
  return `${sign}${pad2(hourNum)}:${match[2] ?? "00"}`;
}

export function zonedLocalToIso(
  parts: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone = PROACTIVE_TIMEZONE,
): string {
  let ts = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  for (let i = 0; i < 4; i++) {
    const got = zonedParts(new Date(ts), timeZone);
    const diffMinutes =
      (parts.year - got.year) * 525_600 +
      (parts.month - got.month) * 43_200 +
      (parts.day - got.day) * 1_440 +
      (parts.hour - got.hour) * 60 +
      (parts.minute - got.minute);
    ts += diffMinutes * 60_000;
  }
  const resolved = zonedParts(new Date(ts), timeZone);
  const offset = offsetOf(new Date(ts), timeZone);
  return `${resolved.year}-${pad2(resolved.month)}-${pad2(resolved.day)}T${pad2(resolved.hour)}:${pad2(resolved.minute)}:00${offset}`;
}

function addCalendarDays(year: number, month: number, day: number, days: number): Zoned {
  const utc = Date.UTC(year, month - 1, day) + days * 86_400_000;
  const shifted = new Date(utc);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: 0,
    minute: 0,
    weekday: shifted.getUTCDay(),
  };
}

export function formatHebrewDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-");
  if (!year || !month || !day) return dateKey;
  return `${day}/${month}/${year}`;
}

export function formatClock(iso: string | null, timeZone = PROACTIVE_TIMEZONE): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const parts = zonedParts(new Date(ms), timeZone);
  return `${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function clampHour(value: unknown, fallback: number): number {
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return fallback;
  return hour;
}

export function clampMinute(value: unknown, fallback: number): number {
  const minute = Number(value);
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return fallback;
  return minute;
}

/** True once the local clock has reached hour:minute, until the hour ends. */
export function isProactiveDue(
  now: Date,
  hour: number,
  minute: number,
  timeZone = PROACTIVE_TIMEZONE,
): boolean {
  const parts = zonedParts(now, timeZone);
  if (parts.hour !== hour) return false;
  return parts.minute >= minute;
}

export type ProactiveKind = "briefing" | "followup" | "weekly";

export function proactiveSlotKey(kind: ProactiveKind, dateKey: string, hour: number): string {
  return `${dateKey}:${kind}:${hour}`;
}

/** Friday 13:00 Jerusalem, before candle-lighting even in winter. */
export function isWeeklySummaryDue(
  now: Date,
  hour = DEFAULT_WEEKLY_HOUR,
  minute = 0,
  timeZone = PROACTIVE_TIMEZONE,
): boolean {
  if (zonedParts(now, timeZone).weekday !== 5) return false;
  return isProactiveDue(now, hour, minute, timeZone);
}

export function jerusalemDayStartIso(now: Date, timeZone = PROACTIVE_TIMEZONE): string {
  const parts = zonedParts(now, timeZone);
  return zonedLocalToIso(
    { year: parts.year, month: parts.month, day: parts.day, hour: 0, minute: 0 },
    timeZone,
  );
}

export function jerusalemWeekStartIso(now: Date, timeZone = PROACTIVE_TIMEZONE): string {
  const parts = zonedParts(now, timeZone);
  const start = addCalendarDays(parts.year, parts.month, parts.day, -parts.weekday);
  return zonedLocalToIso(
    { year: start.year, month: start.month, day: start.day, hour: 0, minute: 0 },
    timeZone,
  );
}

export function buildWeeklySummaryMessage(input: { completed: string[]; stuck: string[] }): string {
  const completed = input.completed.map((title) => title.trim()).filter(Boolean);
  const stuck = input.stuck.map((title) => title.trim()).filter(Boolean);
  if (completed.length === 0 && stuck.length === 0) {
    return "סיכום השבוע מ-BabiTk: לא הייתה תנועה השבוע. שבוע טוב.";
  }
  const lines = ["סיכום השבוע מ-BabiTk", ""];
  if (completed.length > 0) {
    lines.push(`הושלמו (${completed.length}):`);
    completed.slice(0, 8).forEach((title, index) => lines.push(`${index + 1}. ${title}`));
  } else {
    lines.push("השבוע לא סומנה משימה כבוצעת.");
  }
  lines.push("");
  if (stuck.length > 0) {
    lines.push(`עדיין פתוח אחרי התאריך (${stuck.length}):`);
    stuck.slice(0, 8).forEach((title, index) => lines.push(`${index + 1}. ${title}`));
    lines.push("");
  }
  lines.push("שבוע טוב. כתבו «תפריט» לרשימה.");
  return lines.join("\n").trim();
}

export function countProactiveSlots(slots: unknown, dateKey: string): number {
  if (!Array.isArray(slots)) return 0;
  return slots.filter((slot) => typeof slot === "string" && slot.startsWith(`${dateKey}:`)).length;
}

export function appendProactiveSlot(existing: unknown, slotKey: string, dateKey: string): string[] {
  const current = Array.isArray(existing)
    ? existing.filter((slot): slot is string => typeof slot === "string")
    : [];
  const kept = current.filter((slot) => slot.startsWith(`${dateKey}:`));
  if (!kept.includes(slotKey)) kept.push(slotKey);
  return kept;
}

export function slotAlreadySent(existing: unknown, slotKey: string): boolean {
  return Array.isArray(existing) && existing.includes(slotKey);
}

export function partitionOpenTasks(
  tasks: ProactiveTask[],
  now: Date,
  timeZone = PROACTIVE_TIMEZONE,
): { today: ProactiveTask[]; overdue: ProactiveTask[] } {
  const todayKey = localDateKey(now, timeZone);
  const today: ProactiveTask[] = [];
  const overdue: ProactiveTask[] = [];
  for (const task of tasks) {
    if (!task.dueAt) continue;
    const ms = Date.parse(task.dueAt);
    if (!Number.isFinite(ms)) continue;
    const key = localDateKey(new Date(ms), timeZone);
    if (key === todayKey) today.push(task);
    else if (key < todayKey) overdue.push(task);
  }
  const byDue = (a: ProactiveTask, b: ProactiveTask) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "");
  today.sort(byDue);
  overdue.sort(byDue);
  return { today, overdue };
}

export function pickFocusTasks(
  groups: { today: ProactiveTask[]; overdue: ProactiveTask[] },
  limit = 3,
): ProactiveTask[] {
  const seen = new Set<string>();
  const out: ProactiveTask[] = [];
  for (const task of [...groups.overdue, ...groups.today]) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    out.push(task);
    if (out.length >= limit) break;
  }
  return out;
}

function taskLine(task: ProactiveTask, index: number, timeZone: string): string {
  const clock = formatClock(task.dueAt, timeZone);
  const title = task.title.trim() || "משימה";
  return clock ? `${index}. ${title} — ${clock}` : `${index}. ${title}`;
}

export function buildMorningBriefingMessage(
  groups: { today: ProactiveTask[]; overdue: ProactiveTask[] },
  dateKey: string,
  timeZone = PROACTIVE_TIMEZONE,
): string {
  const header = `בוקר טוב מ-BabiTk (${formatHebrewDate(dateKey)})`;
  const focus = pickFocusTasks(groups, 3);
  if (groups.today.length === 0 && groups.overdue.length === 0) {
    return `${header}\n\nאין משימות פתוחות להיום ואין משימות באיחור.\nכתבו «תפריט» לרשימות, או «בטל» אחרי קליטה שגויה.`;
  }
  const sections: string[] = [header, ""];
  if (groups.overdue.length > 0) {
    sections.push(`באיחור (${groups.overdue.length}):`);
    groups.overdue.slice(0, 8).forEach((task, index) => {
      sections.push(taskLine(task, index + 1, timeZone));
    });
    sections.push("");
  }
  if (groups.today.length > 0) {
    sections.push(`היום (${groups.today.length}):`);
    groups.today.slice(0, 12).forEach((task, index) => {
      sections.push(taskLine(task, index + 1, timeZone));
    });
    sections.push("");
  }
  if (focus.length > 0) {
    sections.push("שלוש להתמקד בהן:");
    focus.forEach((task, index) => {
      sections.push(`${index + 1}. ${task.title.trim() || "משימה"}`);
    });
    sections.push("");
  }
  sections.push("השב: «בוצע 1» · «עוד שעה» · «מחר בבוקר» · «תפריט»");
  return sections.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function buildFollowUpMessage(tasks: ProactiveTask[]): string {
  const shown = tasks.slice(0, 5);
  if (shown.length === 0) return "";
  const lines = shown.map((task, index) => `${index + 1}. ${task.title.trim() || "משימה"}`);
  const noun = shown.length === 1 ? "המשימה הזו עדיין פתוחה" : "המשימות האלה עדיין פתוחות";
  return (
    `${noun}:\n${lines.join("\n")}\n\n` +
    `לדחות למחר בבוקר?\n` +
    `השב: «בוצע 1» · «עוד שעה 1» · «מחר 1»`
  );
}

export function followUpQuickReplies(itemId?: string): QuickReply[] {
  const suffix = itemId ? `:${itemId}` : "";
  return [
    { id: `done${suffix}`, title: "בוצע" },
    { id: `snooze1h${suffix}`, title: "עוד שעה" },
    { id: `tomorrow${suffix}`, title: "מחר בבוקר" },
  ];
}

const RECURRENCE_WEEKDAY =
  /כל\s+יום\s+ה?(?:ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/u;

export function parseRecurrencePhrase(text: string): RecurrenceKind | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (/כל\s+1\s+(?:ל|ב)?חודש|ב-?1\s+(?:לכל|בכל|של)\s+חודש|כל\s+ראשון\s+לחודש/u.test(normalized)) {
    return "monthly";
  }
  if (/(?:ימי\s+חול|כל\s+יום\s+עבודה|בימי\s+חול)/u.test(normalized)) return "weekdays";
  if (/(?:כל\s+חודש|חודשית|חודשי|מדי\s+חודש)/u.test(normalized)) return "monthly";
  if (/(?:כל\s+שבוע|שבועית|שבועי|מדי\s+שבוע)/u.test(normalized)) return "weekly";
  if (RECURRENCE_WEEKDAY.test(normalized)) return "weekly";
  if (/(?:כל\s+יום|יומית|יומי|מדי\s+יום)/u.test(normalized)) return "daily";
  return null;
}

function checklistId(index: number): string {
  return `chk-${index + 1}`;
}

function cleanLine(text: string): string {
  return text
    .replace(/^(?:ו?גם|ו)\s+/u, "")
    .replace(/^\d+\s*[.)]\s*/u, "")
    .replace(/^[-*•]\s+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeTask(text: string): boolean {
  // «לחם» is a noun. A task infinitive is longer: לקנות, להתקשר.
  return /^(?:תזכיר(?:י)?\s+לי\s+)?(?:לה[\u0590-\u05FF]{2,}|ל[\u0590-\u05FF]{3,})/u.test(text.trim());
}

function toChecklist(items: string[]): ChecklistLine[] {
  return items.map((text, index) => ({ id: checklistId(index), text, done: false }));
}

function cardFromParts(title: string, content: string, checklist?: ChecklistLine[]): CaptureCard {
  return {
    title: title.slice(0, 120) || "רשימה",
    content,
    checklist,
    recurrence: parseRecurrencePhrase(`${title} ${content}`),
  };
}

/** Structured lists become cards. Ordinary sentences return null. */
export function splitCaptureCards(text: string): CaptureCard[] | null {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length < 8) return null;

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const bullet = lines.filter((line) => /^[-*•]\s+\S/u.test(line)).map(cleanLine).filter((line) => line.length >= 2);
  const numbered = lines
    .filter((line) => /^\d+\s*[.)]\s+\S/u.test(line))
    .map(cleanLine)
    .filter((line) => line.length >= 2);

  const heading = lines.find((line) => !/^[-*•\d]/u.test(line)) ?? "";

  if (bullet.length >= 2 || numbered.length >= 2) {
    const items = bullet.length >= 2 ? bullet : numbered;
    const short = items.every((item) => item.length <= 48 && !looksLikeTask(item));
    const title = cleanLine(heading).replace(/[:：]\s*$/u, "") || "רשימה";
    if (short) {
      return [cardFromParts(title, items.join("\n"), toChecklist(items))];
    }
    return items.map((item) => cardFromParts(item, item));
  }

  const inlineNumbered = [...normalized.matchAll(/(?:^|\s)(\d+)\s*[.)]\s+([^\d\n]{2,80}?)(?=(?:\s+\d+\s*[.)])|$)/gu)]
    .map((match) => cleanLine(match[2] ?? ""))
    .filter((item) => item.length >= 2);
  if (inlineNumbered.length >= 2) {
    const short = inlineNumbered.every((item) => item.length <= 48);
    if (short) {
      return [cardFromParts("רשימה", inlineNumbered.join("\n"), toChecklist(inlineNumbered))];
    }
    return inlineNumbered.map((item) => cardFromParts(item, item));
  }

  const single = normalized.match(/^(.{2,40})[:：]\s*(.+)$/u);
  if (single && !normalized.includes("\n")) {
    const head = cleanLine(single[1] ?? "");
    const parts = (single[2] ?? "")
      .split(/\s*[,،]\s*|\s+ו(?:גם\s+)?/u)
      .map(cleanLine)
      .filter((part) => part.length >= 2 && part.length <= 40);
    if (head && parts.length >= 2 && parts.every((part) => !looksLikeTask(part))) {
      return [cardFromParts(head, parts.join("\n"), toChecklist(parts))];
    }
  }

  const infinitives = lines.map(cleanLine).filter((line) => looksLikeTask(line));
  if (infinitives.length >= 2) {
    return infinitives.map((item) => cardFromParts(item, item));
  }

  const conjunctions = normalized
    .split(/\s+וגם\s+/u)
    .map(cleanLine)
    .filter((part) => part.length >= 2);
  if (conjunctions.length >= 2 && conjunctions.filter(looksLikeTask).length >= 2) {
    return conjunctions.filter(looksLikeTask).map((item) => cardFromParts(item, item));
  }

  return null;
}

const CATEGORY_RULES: Array<{ tag: string; priority: "high" | "normal"; re: RegExp }> = [
  { tag: "פיננסי", priority: "high", re: /ארנונה|לשלם|חשבון|בנק|רישיון\s+רכב/u },
  { tag: "בריאות", priority: "high", re: /רופא|קופת\s+חולים|תרופה|תור\s+ל/u },
  { tag: "קניות", priority: "normal", re: /לקנות|קניות|סופר/u },
  { tag: "לימודים", priority: "normal", re: /לימוד|שיעור|מבחן|שיעורים/u },
  { tag: "עבודה", priority: "normal", re: /בעבודה|לעבודה|ישיבה|לקוח|מייל/u },
  { tag: "בית", priority: "normal", re: /אסיפת\s+הורים|גן\s+ילדים|בית\s+ספר/u },
];

export function suggestCategory(
  text: string,
  allowedTags: string[] = [],
): { tag: string; priority: "high" | "normal" } | null {
  const pool = allowedTags.map((tag) => tag.trim()).filter(Boolean);
  for (const rule of CATEGORY_RULES) {
    if (!rule.re.test(text)) continue;
    if (pool.length === 0) return { tag: rule.tag, priority: rule.priority };
    const hit = pool.find((tag) => tag === rule.tag || tag.includes(rule.tag) || rule.tag.includes(tag));
    if (hit) return { tag: hit, priority: rule.priority };
  }
  return null;
}

export function enrichWhatsAppCapture(
  text: string,
  rows: CaptureRow[],
  options: {
    multiCard: boolean;
    recurrence: boolean;
    autoCategory: boolean;
    allowedTags?: string[];
  },
): CaptureRow[] {
  let next = rows.map((row) => ({ ...row, tags: [...(row.tags ?? [])] }));
  if (options.multiCard) {
    const cards = splitCaptureCards(text);
    if (cards && cards.length >= 2 && next.length <= 1) {
      const template = next[0];
      next = cards.map((card) => ({
        title: card.title,
        content: card.content,
        is_actionable: true,
        tags: template?.tags ? [...template.tags] : [],
        due_date: template?.due_date ?? null,
        analysis: template?.analysis,
        reminder_recurrence: card.recurrence ?? template?.reminder_recurrence ?? null,
        checklist: card.checklist,
        priority: template?.priority,
      }));
    } else if (
      cards &&
      cards.length === 1 &&
      cards[0]?.checklist &&
      cards[0].checklist.length >= 2 &&
      next[0] &&
      !(next[0].checklist && next[0].checklist.length > 0)
    ) {
      const card = cards[0];
      next[0] = {
        ...next[0],
        title: card.title || next[0].title,
        content: card.content || next[0].content,
        checklist: card.checklist,
        reminder_recurrence: next[0].reminder_recurrence ?? card.recurrence,
      };
    }
  }

  if (options.recurrence) {
    const phrase = parseRecurrencePhrase(text);
    if (phrase) {
      next = next.map((row) =>
        row.reminder_recurrence ? row : { ...row, reminder_recurrence: phrase },
      );
    }
  }

  if (options.autoCategory) {
    next = next.map((row) => {
      const suggestion = suggestCategory(`${text} ${row.title} ${row.content}`, options.allowedTags);
      if (!suggestion) return row;
      const tags = row.tags.includes(suggestion.tag) ? row.tags : [...row.tags, suggestion.tag].slice(0, 3);
      return { ...row, tags, priority: row.priority ?? suggestion.priority };
    });
  }

  return next;
}

export function parseMoveCommand(text: string): MoveCommand | null {
  const normalized = text.trim().replace(/\s+/g, " ");
  const match = normalized.match(
    /^(?:תזיז(?:י)?|תעביר(?:י)?|העבר(?:י)?)(?:\s+את)?(?:\s+(.+?))?\s+ליום\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)$/u,
  );
  if (!match) return null;
  const weekday = WEEKDAY_NAMES.indexOf(match[2] as (typeof WEEKDAY_NAMES)[number]);
  if (weekday < 0) return null;
  const title = match[1]?.trim() || null;
  return { title, weekday };
}

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? "";
}

/** Upcoming weekday at hour:minute in Asia/Jerusalem, as an ISO string with offset. */
export function nextWeekdayIso(
  now: Date,
  weekday: number,
  hour = 9,
  minute = 0,
  timeZone = PROACTIVE_TIMEZONE,
): string {
  const parts = zonedParts(now, timeZone);
  let delta = (weekday - parts.weekday + 7) % 7;
  if (delta === 0 && parts.hour * 60 + parts.minute >= hour * 60 + minute) delta = 7;
  const day = addCalendarDays(parts.year, parts.month, parts.day, delta);
  return zonedLocalToIso({ ...day, hour, minute }, timeZone);
}

export function parseNoteSearch(text: string): string | null {
  const normalized = text.trim().replace(/\s+/g, " ");
  const match = normalized.match(/^(?:מה\s+רשמתי\s+על|תחפש(?:י)?|חפש(?:י)?(?:\s+לי)?)\s+(.+)$/u);
  const query = match?.[1]?.trim() ?? "";
  if (query.length < 2 || query.length > 80) return null;
  return query;
}

export function tokenizeSearch(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

export function rankByOverlap(
  query: string,
  docs: Array<{ id: string; title: string; content?: string | null }>,
): Array<{ id: string; title: string; score: number }> {
  const tokens = tokenizeSearch(query);
  const needle = query.trim().toLowerCase();
  const ranked = docs
    .map((doc) => {
      const title = doc.title ?? "";
      const hay = `${title}\n${doc.content ?? ""}`.toLowerCase();
      let score = 0;
      if (needle && hay.includes(needle)) score += 2;
      const words = new Set(tokenizeSearch(hay));
      for (const token of tokens) {
        if (words.has(token) || hay.includes(token)) score += 1;
        const bare = token.replace(/^[הובכלמש]/u, "");
        if (bare.length >= 3 && bare !== token && hay.includes(bare)) score += 1;
      }
      return { id: doc.id, title, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "he"));
  return ranked;
}

export function buildSearchReply(query: string, hits: Array<{ title: string }>): string {
  if (hits.length === 0) {
    return `לא מצאתי כרטיס על «${query}».`;
  }
  const lines = hits.slice(0, 5).map((hit, index) => `${index + 1}. ${hit.title}`);
  return `מצאתי על «${query}»:\n${lines.join("\n")}`;
}

export type UndoKind = "capture" | "complete" | "snooze";

export type UndoItemSnapshot = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  deleted_at: string | null;
};

export type UndoEntry = {
  id: string;
  at: string;
  kind: UndoKind;
  items: UndoItemSnapshot[];
};

export type UndoState = { stack: UndoEntry[] };

export function emptyUndoState(): UndoState {
  return { stack: [] };
}

export function readUndoState(value: unknown): UndoState {
  if (!value || typeof value !== "object") return emptyUndoState();
  const stack = (value as { stack?: unknown }).stack;
  if (!Array.isArray(stack)) return emptyUndoState();
  const entries: UndoEntry[] = [];
  for (const row of stack) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    if (rec.kind !== "capture" && rec.kind !== "complete" && rec.kind !== "snooze") continue;
    if (typeof rec.id !== "string" || typeof rec.at !== "string") continue;
    if (!Array.isArray(rec.items)) continue;
    const items: UndoItemSnapshot[] = [];
    for (const item of rec.items) {
      if (!item || typeof item !== "object") continue;
      const snap = item as Record<string, unknown>;
      if (typeof snap.id !== "string") continue;
      items.push({
        id: snap.id,
        title: typeof snap.title === "string" ? snap.title : "",
        status: typeof snap.status === "string" ? snap.status : "inbox",
        due_date: typeof snap.due_date === "string" ? snap.due_date : null,
        deleted_at: typeof snap.deleted_at === "string" ? snap.deleted_at : null,
      });
    }
    if (items.length === 0) continue;
    entries.push({ id: rec.id, at: rec.at, kind: rec.kind, items });
  }
  return { stack: entries.slice(0, 5) };
}

export function pushUndo(state: UndoState, entry: UndoEntry): UndoState {
  return { stack: [entry, ...state.stack].slice(0, 5) };
}

export function popUndo(state: UndoState): { entry: UndoEntry | null; state: UndoState } {
  const [entry, ...rest] = state.stack;
  return { entry: entry ?? null, state: { stack: rest } };
}
