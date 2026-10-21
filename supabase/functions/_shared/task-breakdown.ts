/**
 * Local breakdown for a big plan. No model call.
 * Cards are created only after the user answers «כן».
 */

const TIMEZONE = "Asia/Jerusalem";
const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;

export type BreakdownStep = { title: string; dueDate: string };

export type PendingBreakdown = {
  sourceText: string;
  steps: BreakdownStep[];
  at: string;
};

const PLAN =
  /יום\s+הולדת|לארגן\s+(?:אירוע|חתונה|ברית|מסיבה|יום\s+הולדת)|להכין\s+אירוע|לסדר\s+(?:אירוע|מסיבה)/u;

export function looksLikeBigPlan(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length >= 8 && normalized.length <= 180 && PLAN.test(normalized);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function zonedParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const hour = Number(get("hour"));
  const weekday: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: hour === 24 ? 0 : hour,
    minute: Number(get("minute")),
    weekday: weekday[get("weekday")] ?? 0,
  };
}

function jerusalemIso(year: number, month: number, day: number, hour: number, minute: number): string {
  let ts = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const got = zonedParts(new Date(ts));
    const diff =
      (year - got.year) * 525_600 +
      (month - got.month) * 43_200 +
      (day - got.day) * 1_440 +
      (hour - got.hour) * 60 +
      (minute - got.minute);
    ts += diff * 60_000;
  }
  const resolved = zonedParts(new Date(ts));
  const offsetParts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(new Date(ts));
  const offset = offsetParts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+3";
  const match = offset.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  const sign = match?.[1]?.startsWith("-") ? "-" : "+";
  const hourNum = Math.abs(Number.parseInt(match?.[1] ?? "3", 10));
  return `${resolved.year}-${pad(resolved.month)}-${pad(resolved.day)}T${pad(resolved.hour)}:${pad(resolved.minute)}:00${sign}${pad(hourNum)}:${match?.[2] ?? "00"}`;
}

function addDays(year: number, month: number, day: number, days: number) {
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function anchor(text: string, now: Date): { year: number; month: number; day: number } {
  const parts = zonedParts(now);
  const named = WEEKDAYS.findIndex((name) => text.includes(`יום ${name}`) || text.includes(`ליום ${name}`));
  if (named >= 0) {
    let delta = (named - parts.weekday + 7) % 7;
    if (delta === 0) delta = 7;
    return addDays(parts.year, parts.month, parts.day, delta);
  }
  return addDays(parts.year, parts.month, parts.day, 7);
}

export function proposeBreakdown(text: string, now = new Date()): PendingBreakdown | null {
  const sourceText = text.replace(/\s+/g, " ").trim();
  if (!looksLikeBigPlan(sourceText)) return null;
  const day = anchor(sourceText, now);
  const birthday = /יום\s+הולדת/u.test(sourceText);
  const titles = birthday
    ? ["רשימת מוזמנים והזמנות", "הזמנת עוגה", "סידור וקניות אחרונות"]
    : ["להגדיר מה צריך", "לתאם עם מי שמעורב", "לסגור פרטים אחרונים"];
  const offsets = [-3, -1, 0];
  const steps = titles.map((title, index) => {
    const when = addDays(day.year, day.month, day.day, offsets[index]!);
    return { title, dueDate: jerusalemIso(when.year, when.month, when.day, 9, 0) };
  });
  return { sourceText, steps, at: now.toISOString() };
}

export function parseBreakdownAnswer(text: string): "yes" | "no" | null {
  const normalized = text.trim();
  if (/^(?:כן|אישור|שמור)[.!?]?$/u.test(normalized)) return "yes";
  if (/^(?:לא)[.!?]?$/u.test(normalized)) return "no";
  return null;
}

function formatDue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function breakdownReply(pending: PendingBreakdown): string {
  const lines = pending.steps.map((step, index) => `${index + 1}. ${step.title} — ${formatDue(step.dueDate)}`);
  return `אפשר לפרק את זה ל-${pending.steps.length} שלבים:\n${lines.join("\n")}\n\nלשמור את השלבים? כתבו «כן» או «לא».`;
}

export function readPendingBreakdown(value: unknown): PendingBreakdown | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.sourceText !== "string" || !Array.isArray(row.steps)) return null;
  const steps: BreakdownStep[] = [];
  for (const step of row.steps) {
    if (!step || typeof step !== "object") continue;
    const item = step as Record<string, unknown>;
    if (typeof item.title !== "string" || typeof item.dueDate !== "string") continue;
    steps.push({ title: item.title, dueDate: item.dueDate });
  }
  if (steps.length < 3) return null;
  return { sourceText: row.sourceText, steps, at: typeof row.at === "string" ? row.at : "" };
}

export function confirmedStepCards(pending: PendingBreakdown): Array<{
  title: string;
  content: string;
  due_date: string;
}> {
  return pending.steps.map((step) => ({
    title: step.title,
    content: step.title,
    due_date: step.dueDate,
  }));
}
