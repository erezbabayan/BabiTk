import type { MindtaskerItem } from "../types";

export const TASK_CALENDAR_TZ = "Asia/Jerusalem";
export const OPEN_TASK_CALENDAR_EVENT = "babitk-open-task-calendar";

export const HEBREW_WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"] as const;

export const HEBREW_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
] as const;

export type CalendarDayCell = {
  ymd: string;
  day: number;
  inMonth: boolean;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function taskCalendarDayKey(
  isoOrDate: string | Date,
  timeZone = TASK_CALENDAR_TZ,
): string | null {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function calendarMonthFromYmd(
  ymd: string,
): { year: number; month: number } | null {
  if (!YMD_RE.test(ymd)) return null;
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return { year, month };
}

/** Today/tomorrow chips in calendar view jump to that Jerusalem day. */
export function calendarChipFocusYmd(
  chip: string,
  now: Date = new Date(),
): string | null {
  const today = taskCalendarDayKey(now);
  if (!today) return null;
  if (chip === "today") return today;
  if (chip === "tomorrow") return addDaysYmd(today, 1);
  return null;
}

export function monthYmd(year: number, month: number): string {
  return `${year}-${pad2(month)}-01`;
}

export const CALENDAR_SWIPE_THRESHOLD_PX = 48;

/** Swipe right goes to the previous month; swipe left goes to the next month. */
export function calendarSwipeMonthDelta(
  dx: number,
  thresholdPx = CALENDAR_SWIPE_THRESHOLD_PX,
): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || thresholdPx <= 0) return 0;
  if (dx >= thresholdPx) return -1;
  if (dx <= -thresholdPx) return 1;
  return 0;
}

export function shiftMonth(year: number, month: number, delta: number): {
  year: number;
  month: number;
} {
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
}

/** Sunday-first month grid (Israel). `month` is 1–12. */
export function monthGrid(year: number, month: number): CalendarDayCell[] {
  const firstYmd = monthYmd(year, month);
  const startOffset = new Date(`${firstYmd}T12:00:00Z`).getUTCDay();
  const startYmd = addDaysYmd(firstYmd, -startOffset);
  const prefix = `${year}-${pad2(month)}`;
  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const ymd = addDaysYmd(startYmd, i);
    cells.push({
      ymd,
      day: Number(ymd.slice(8, 10)),
      inMonth: ymd.startsWith(prefix),
    });
  }
  return cells;
}

export function hebrewMonthTitle(year: number, month: number): string {
  return `${HEBREW_MONTHS[month - 1] ?? ""} ${year}`;
}

function analysisScheduleIso(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const analysis = (metadata as Record<string, unknown>).analysis;
  if (!analysis || typeof analysis !== "object") return null;
  const record = analysis as Record<string, unknown>;
  if (typeof record.target_at === "string" && record.target_at.length > 0) {
    return record.target_at;
  }
  if (typeof record.notify_at === "string" && record.notify_at.length > 0) {
    return record.notify_at;
  }
  return null;
}

/** Same date the card shows: due_date, inferred reminder, or analysis target. */
export function calendarItemDueIso(
  item: Pick<
    MindtaskerItem,
    | "title"
    | "content"
    | "is_actionable"
    | "due_date"
    | "deleted_at"
    | "status"
    | "completed_at"
    | "metadata"
  >,
): string | null {
  if (item.deleted_at || item.status === "completed" || item.completed_at) {
    return null;
  }
  const source =
    (typeof item.due_date === "string" && item.due_date.length > 0 ? item.due_date : null) ||
    analysisScheduleIso(item.metadata);
  if (!source || Number.isNaN(Date.parse(source))) return null;
  return source;
}

export function isCalendarTask(
  item: Pick<
    MindtaskerItem,
    | "title"
    | "content"
    | "is_actionable"
    | "due_date"
    | "deleted_at"
    | "status"
    | "completed_at"
    | "metadata"
  >,
): boolean {
  return calendarItemDueIso(item) !== null;
}

export function calendarTasks(items: MindtaskerItem[]): MindtaskerItem[] {
  return items.filter(isCalendarTask);
}

export function groupCalendarTasksByDay(
  items: MindtaskerItem[],
): Map<string, MindtaskerItem[]> {
  const map = new Map<string, MindtaskerItem[]>();
  for (const item of items) {
    const due = calendarItemDueIso(item);
    const key = due ? taskCalendarDayKey(due) : null;
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((left, right) => {
      const a = Date.parse(calendarItemDueIso(left) ?? "");
      const b = Date.parse(calendarItemDueIso(right) ?? "");
      return a - b;
    });
  }
  return map;
}

export function requestOpenTaskCalendar(): void {
  window.dispatchEvent(new Event(OPEN_TASK_CALENDAR_EVENT));
}
