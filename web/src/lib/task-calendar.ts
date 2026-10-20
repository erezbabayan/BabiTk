import { applyTextClockToIso } from "../../../convex/lib/ingest/hebrewDates.ts";
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
  return applyTextClockToIso(source, `${item.title} ${item.content}`.trim());
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
  recurring: boolean;
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

function ymdDiffDays(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T12:00:00Z`);
  const to = Date.parse(`${toYmd}T12:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/** First series day that is >= `fromYmd` (daily/weekdays fill the whole window). */
function firstOccurrenceOnOrAfter(
  seedYmd: string,
  recurrence: CalendarRecurrence,
  fromYmd: string,
): string {
  switch (recurrence) {
    case "daily":
      return fromYmd;
    case "weekdays": {
      let cursor = fromYmd;
      for (let i = 0; i < 8; i += 1) {
        if (isIsraeliWeekdayYmd(cursor)) return cursor;
        cursor = addDaysYmd(cursor, 1);
      }
      return cursor;
    }
    case "weekly": {
      const delta = ymdDiffDays(seedYmd, fromYmd);
      if (delta <= 0) {
        return addDaysYmd(seedYmd, -7 * Math.floor(ymdDiffDays(fromYmd, seedYmd) / 7));
      }
      return addDaysYmd(seedYmd, 7 * Math.ceil(delta / 7));
    }
    case "monthly": {
      if (seedYmd >= fromYmd) {
        let cursor = seedYmd;
        for (let step = 0; step < 240; step += 1) {
          const prev = previousCalendarRecurrenceYmd(cursor, "monthly");
          if (prev === cursor || prev < fromYmd) return cursor;
          cursor = prev;
        }
        return cursor;
      }
      let cursor = seedYmd;
      for (let step = 0; step < 240; step += 1) {
        if (cursor >= fromYmd) return cursor;
        const next = nextCalendarRecurrenceYmd(cursor, "monthly");
        if (next === cursor) return next;
        cursor = next;
      }
      return cursor;
    }
  }
}

function lastOccurrenceOnOrBefore(
  seedYmd: string,
  recurrence: CalendarRecurrence,
  toYmd: string,
): string {
  switch (recurrence) {
    case "daily":
      return toYmd;
    case "weekdays": {
      let cursor = toYmd;
      for (let i = 0; i < 8; i += 1) {
        if (isIsraeliWeekdayYmd(cursor)) return cursor;
        cursor = addDaysYmd(cursor, -1);
      }
      return cursor;
    }
    case "weekly":
      return addDaysYmd(seedYmd, 7 * Math.floor(ymdDiffDays(seedYmd, toYmd) / 7));
    case "monthly": {
      if (seedYmd <= toYmd) {
        let cursor = seedYmd;
        for (let step = 0; step < 240; step += 1) {
          const next = nextCalendarRecurrenceYmd(cursor, "monthly");
          if (next === cursor || next > toYmd) return cursor;
          cursor = next;
        }
        return cursor;
      }
      let cursor = seedYmd;
      for (let step = 0; step < 240; step += 1) {
        if (cursor <= toYmd) return cursor;
        const prev = previousCalendarRecurrenceYmd(cursor, "monthly");
        if (prev === cursor) return prev;
        cursor = prev;
      }
      return cursor;
    }
  }
}

/** First day with a calendar item, preferring on/after `aroundYmd`. */
export function firstBusyCalendarYmd(
  items: MindtaskerItem[],
  aroundYmd: string,
): string | null {
  const origin = calendarMonthFromYmd(aroundYmd);
  if (!origin) return null;
  const fromShift = shiftMonth(origin.year, origin.month, -6);
  const afterTo = shiftMonth(origin.year, origin.month, 12);
  const fromYmd = monthYmd(fromShift.year, fromShift.month);
  const toYmd = addDaysYmd(monthYmd(afterTo.year, afterTo.month), -1);

  let bestOnOrAfter: string | null = null;
  let bestAny: string | null = null;

  const consider = (ymd: string | null | undefined) => {
    if (!ymd || ymd < fromYmd || ymd > toYmd) return;
    if (!bestAny || ymd > bestAny) bestAny = ymd;
    if (ymd >= aroundYmd && (!bestOnOrAfter || ymd < bestOnOrAfter)) {
      bestOnOrAfter = ymd;
    }
  };

  for (const item of items) {
    const due = calendarItemDueIso(item);
    if (!due) continue;
    const seedYmd = taskCalendarDayKey(due);
    if (!seedYmd) continue;
    const recurrence = calendarItemRecurrence(item.metadata);
    if (!recurrence) {
      consider(seedYmd);
      continue;
    }
    const start = aroundYmd > fromYmd ? aroundYmd : fromYmd;
    consider(firstOccurrenceOnOrAfter(seedYmd, recurrence, start));
    consider(lastOccurrenceOnOrBefore(seedYmd, recurrence, toYmd));
  }

  return bestOnOrAfter ?? bestAny;
}

export type CalendarRecurrence = "daily" | "weekly" | "monthly" | "weekdays";

function metadataRecord(metadata: unknown): Record<string, unknown> | null {
  if (!metadata) return null;
  if (typeof metadata === "string") {
    try {
      const parsed: unknown = JSON.parse(metadata);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof metadata === "object") return metadata as Record<string, unknown>;
  return null;
}

export function calendarItemRecurrence(
  metadata: unknown,
): CalendarRecurrence | null {
  const record = metadataRecord(metadata);
  if (!record) return null;
  const value = record.reminder_recurrence;
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

export const CALENDAR_RECURRING_ROW_TONE = {
  backgroundColor: "#c5f6e4",
  borderColor: "#7dd3b0",
} as const;

/** Light mint for repeating items so they are distinct from one-off white rows. */
export function calendarDayTaskRowClass(recurring: boolean): string {
  return recurring
    ? `${CALENDAR_DAY_ROW_BASE} babitk-calendar-day-task--recurring border-teal-300 bg-teal-100 hover:bg-teal-200`
    : `${CALENDAR_DAY_ROW_BASE} border-slate-200 bg-white hover:bg-blue-50`;
}

export function calendarDayTaskRowStyle(
  recurring: boolean,
): { backgroundColor: string; borderColor: string } | undefined {
  return recurring ? { ...CALENDAR_RECURRING_ROW_TONE } : undefined;
}

export function calendarDayDotClass(
  recurring: boolean,
  options?: { searchHit?: boolean },
): string {
  if (options?.searchHit) {
    return "h-1.5 w-1.5 rounded-full babitk-calendar-dot--search bg-red-500";
  }
  return recurring
    ? "h-1.5 w-1.5 rounded-full bg-teal-400"
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

  let cursor = firstOccurrenceOnOrAfter(seedYmd, recurrence, fromYmd);

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
    const recurring = recurrence !== null;
    const ymds = range
      ? calendarOccurrenceYmds(seedYmd, recurrence, range.fromYmd, range.toYmd)
      : [seedYmd];
    for (const ymd of ymds) {
      const list = map.get(ymd) ?? [];
      list.push({ item, dueIso: dueIsoOnYmd(due, ymd), recurring });
      map.set(ymd, list);
    }
  }
  for (const list of map.values()) {
    list.sort((left, right) => Date.parse(left.dueIso) - Date.parse(right.dueIso));
  }
  return map;
}

export type CalendarSearchHit = {
  item: MindtaskerItem;
  dueIso: string;
  ymd: string;
  extraDayCount: number;
};

/** One row per item, on the occurrence on/after `preferYmd` when possible. */
export function uniqueCalendarSearchHits(
  byDay: Map<string, CalendarDayTask[]>,
  preferYmd: string,
): CalendarSearchHit[] {
  const dayCount = new Map<string, number>();
  const chosen = new Map<string, { item: MindtaskerItem; dueIso: string; ymd: string }>();
  const ymds = [...byDay.keys()].sort();
  for (const ymd of ymds) {
    for (const entry of byDay.get(ymd) ?? []) {
      dayCount.set(entry.item.id, (dayCount.get(entry.item.id) ?? 0) + 1);
      const existing = chosen.get(entry.item.id);
      if (!existing) {
        chosen.set(entry.item.id, { item: entry.item, dueIso: entry.dueIso, ymd });
        continue;
      }
      const existingOk = existing.ymd >= preferYmd;
      const nextOk = ymd >= preferYmd;
      if (!existingOk && nextOk) {
        chosen.set(entry.item.id, { item: entry.item, dueIso: entry.dueIso, ymd });
      }
    }
  }
  return [...chosen.values()]
    .map((hit) => ({
      ...hit,
      extraDayCount: Math.max(0, (dayCount.get(hit.item.id) ?? 1) - 1),
    }))
    .sort(
      (left, right) =>
        left.ymd.localeCompare(right.ymd) || Date.parse(left.dueIso) - Date.parse(right.dueIso),
    );
}

export function groupCalendarSearchHitsByDay(
  hits: CalendarSearchHit[],
): Array<{ ymd: string; hits: CalendarSearchHit[] }> {
  const groups: Array<{ ymd: string; hits: CalendarSearchHit[] }> = [];
  for (const hit of hits) {
    const last = groups[groups.length - 1];
    if (last && last.ymd === hit.ymd) last.hits.push(hit);
    else groups.push({ ymd: hit.ymd, hits: [hit] });
  }
  return groups;
}

export function requestOpenTaskCalendar(): void {
  window.dispatchEvent(new Event(OPEN_TASK_CALENDAR_EVENT));
}
