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

/** Swipe right goes to the next month; swipe left goes to the previous month. */
export function calendarSwipeMonthDelta(
  dx: number,
  thresholdPx = CALENDAR_SWIPE_THRESHOLD_PX,
): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || thresholdPx <= 0) return 0;
  if (dx >= thresholdPx) return 1;
  if (dx <= -thresholdPx) return -1;
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

export type CalendarDayTask = {
  item: MindtaskerItem;
  dueIso: string;
};

export type CalendarDayRange = {
  fromYmd: string;
  toYmd: string;
};

/** Range covering the previous month through the next month (busy-day nav). */
export function calendarMonthExpandRange(
  year: number,
  month: number,
): CalendarDayRange {
  const prev = shiftMonth(year, month, -1);
  const afterNext = shiftMonth(year, month, 2);
  return {
    fromYmd: monthYmd(prev.year, prev.month),
    toYmd: addDaysYmd(monthYmd(afterNext.year, afterNext.month), -1),
  };
}

export type CalendarRecurrence = "daily" | "weekly" | "monthly" | "weekdays";

export function calendarItemRecurrence(
  metadata: unknown,
): CalendarRecurrence | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).reminder_recurrence;
  if (
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "weekdays"
  ) {
    return value;
  }
  return null;
}

export function isCalendarRecurringItem(
  item: Pick<MindtaskerItem, "metadata">,
): boolean {
  return calendarItemRecurrence(item.metadata) !== null;
}

const CALENDAR_DAY_ROW_BASE =
  "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-right";

/** Light mint for repeating items so they are distinct from one-off white rows. */
export function calendarDayTaskRowClass(recurring: boolean): string {
  return recurring
    ? `${CALENDAR_DAY_ROW_BASE} border-emerald-200 bg-emerald-50 hover:bg-emerald-100`
    : `${CALENDAR_DAY_ROW_BASE} border-slate-200 bg-white hover:bg-blue-50`;
}

export function calendarDayDotClass(recurring: boolean): string {
  return recurring
    ? "h-1 w-1 rounded-full bg-emerald-300"
    : "h-1 w-1 rounded-full bg-blue-500";
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonthsYmd(ymd: string, months: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1));
  const nextYear = shifted.getUTCFullYear();
  const nextMonth = shifted.getUTCMonth() + 1;
  const nextDay = Math.min(day, daysInUtcMonth(nextYear, nextMonth));
  return `${nextYear}-${pad2(nextMonth)}-${pad2(nextDay)}`;
}

function isIsraeliWeekdayYmd(ymd: string): boolean {
  const weekday = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return weekday >= 0 && weekday <= 4;
}

function nextCalendarRecurrenceYmd(ymd: string, recurrence: CalendarRecurrence): string {
  switch (recurrence) {
    case "daily":
      return addDaysYmd(ymd, 1);
    case "weekly":
      return addDaysYmd(ymd, 7);
    case "monthly":
      return addMonthsYmd(ymd, 1);
    case "weekdays": {
      let candidate = addDaysYmd(ymd, 1);
      for (let i = 0; i < 8; i += 1) {
        if (isIsraeliWeekdayYmd(candidate)) return candidate;
        candidate = addDaysYmd(candidate, 1);
      }
      return candidate;
    }
  }
}

function previousCalendarRecurrenceYmd(
  ymd: string,
  recurrence: CalendarRecurrence,
): string {
  switch (recurrence) {
    case "daily":
      return addDaysYmd(ymd, -1);
    case "weekly":
      return addDaysYmd(ymd, -7);
    case "monthly":
      return addMonthsYmd(ymd, -1);
    case "weekdays": {
      let candidate = addDaysYmd(ymd, -1);
      for (let i = 0; i < 8; i += 1) {
        if (isIsraeliWeekdayYmd(candidate)) return candidate;
        candidate = addDaysYmd(candidate, -1);
      }
      return candidate;
    }
  }
}

const MAX_CALENDAR_OCCURRENCE_DAYS = 2500;

/** Civil days in `[fromYmd, toYmd]` for a stored due date and recurrence. */
export function calendarOccurrenceYmds(
  seedYmd: string,
  recurrence: CalendarRecurrence | null | undefined,
  fromYmd: string,
  toYmd: string,
): string[] {
  if (!YMD_RE.test(seedYmd) || fromYmd > toYmd) return [];
  if (!recurrence) {
    return seedYmd >= fromYmd && seedYmd <= toYmd ? [seedYmd] : [];
  }

  let cursor = seedYmd;
  for (let step = 0; step < MAX_CALENDAR_OCCURRENCE_DAYS; step += 1) {
    const prev = previousCalendarRecurrenceYmd(cursor, recurrence);
    if (prev === cursor || prev < fromYmd) break;
    cursor = prev;
  }

  const out: string[] = [];
  for (let step = 0; step < MAX_CALENDAR_OCCURRENCE_DAYS; step += 1) {
    if (cursor > toYmd) break;
    if (cursor >= fromYmd) out.push(cursor);
    const next = nextCalendarRecurrenceYmd(cursor, recurrence);
    if (next === cursor) break;
    cursor = next;
  }
  return out;
}

function dueIsoOnYmd(seedIso: string, targetYmd: string): string {
  const seedYmd = taskCalendarDayKey(seedIso);
  if (!seedYmd || seedYmd === targetYmd) return seedIso;
  const seedMs = Date.parse(seedIso);
  const seedNoon = Date.parse(`${seedYmd}T12:00:00Z`);
  const targetNoon = Date.parse(`${targetYmd}T12:00:00Z`);
  if (!Number.isFinite(seedMs) || !Number.isFinite(seedNoon) || !Number.isFinite(targetNoon)) {
    return seedIso;
  }
  return new Date(seedMs + (targetNoon - seedNoon)).toISOString();
}

export function groupCalendarTasksByDay(
  items: MindtaskerItem[],
  range?: CalendarDayRange,
): Map<string, CalendarDayTask[]> {
  const map = new Map<string, CalendarDayTask[]>();
  for (const item of items) {
    const due = calendarItemDueIso(item);
    if (!due) continue;
    const seedYmd = taskCalendarDayKey(due);
    if (!seedYmd) continue;
    const recurrence = calendarItemRecurrence(item.metadata);
    const ymds = range
      ? calendarOccurrenceYmds(seedYmd, recurrence, range.fromYmd, range.toYmd)
      : [seedYmd];
    for (const ymd of ymds) {
      const list = map.get(ymd) ?? [];
      list.push({ item, dueIso: dueIsoOnYmd(due, ymd) });
      map.set(ymd, list);
    }
  }
  for (const list of map.values()) {
    list.sort((left, right) => Date.parse(left.dueIso) - Date.parse(right.dueIso));
  }
  return map;
}

export function requestOpenTaskCalendar(): void {
  window.dispatchEvent(new Event(OPEN_TASK_CALENDAR_EVENT));
}
