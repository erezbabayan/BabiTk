import type { MindtaskerItem } from "./supabase";
import type { UserTag } from "./tags";
import { normalizeTagName } from "./tags";
import { filterItemsByPriority } from "./item-priority";
import { getReminderRecurrence, nextActiveDueDate } from "./resolve-item-reminder";

type DatedItem = { due_date: string | null; metadata?: unknown };

export type BoardDateFilter = "all" | "today" | "tomorrow" | "overdue" | "undated";

const FILTER_TIMEZONE = "Asia/Jerusalem";

function zonedDayKey(date: Date, timeZone = FILTER_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

export function filterItemsByQuery(
  items: MindtaskerItem[],
  query: string,
): MindtaskerItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.content.toLowerCase().includes(q) ||
      item.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
}

export function filterItemsByTag(
  items: MindtaskerItem[],
  tag: string | null,
): MindtaskerItem[] {
  if (!tag) return items;
  return items.filter((item) => item.tags.includes(tag));
}

export function itemDueTimestamp(
  item: DatedItem,
  now: Date | number = Date.now(),
): number | null {
  const iso = nextActiveDueDate(item, now);
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function isItemDueToday(item: DatedItem, now = new Date()): boolean {
  const ts = itemDueTimestamp(item, now);
  if (ts === null) return false;
  return zonedDayKey(new Date(ts)) === zonedDayKey(now);
}

export function isItemDueTomorrow(item: DatedItem, now = new Date()): boolean {
  const ts = itemDueTimestamp(item, now);
  if (ts === null) return false;
  return zonedDayKey(new Date(ts)) === addYmd(zonedDayKey(now), 1);
}

export function isItemOverdue(item: DatedItem, now = Date.now()): boolean {
  if (getReminderRecurrence(item.metadata)) return false;
  const ts = itemDueTimestamp(item, now);
  return ts !== null && ts < now;
}

export function isItemUndated(item: DatedItem): boolean {
  return itemDueTimestamp(item) === null;
}

export function filterItemsDueToday(
  items: MindtaskerItem[],
  todayOnly: boolean,
  now = new Date(),
): MindtaskerItem[] {
  if (!todayOnly) return items;
  return items.filter((item) => isItemDueToday(item, now));
}

export function filterItemsByDate(
  items: MindtaskerItem[],
  dateFilter: BoardDateFilter,
  now = Date.now(),
): MindtaskerItem[] {
  if (dateFilter === "all") return items;
  if (dateFilter === "today") {
    const today = new Date(now);
    return items.filter((item) => isItemDueToday(item, today));
  }
  if (dateFilter === "tomorrow") {
    const today = new Date(now);
    return items.filter((item) => isItemDueTomorrow(item, today));
  }
  if (dateFilter === "overdue") {
    return items.filter((item) => isItemOverdue(item, now));
  }
  return items.filter((item) => isItemUndated(item));
}

export function applyBoardItemFilters(
  items: MindtaskerItem[],
  tag: string | null,
  priorityOnly: boolean,
  dateFilter: BoardDateFilter | boolean = "all",
  now = Date.now(),
): MindtaskerItem[] {
  const resolved: BoardDateFilter =
    typeof dateFilter === "boolean" ? (dateFilter ? "today" : "all") : dateFilter;
  return filterItemsByDate(
    filterItemsByPriority(filterItemsByTag(items, tag), priorityOnly),
    resolved,
    now,
  );
}

export function boardFiltersActive(options: {
  query?: string;
  tag?: string | null;
  priorityOnly?: boolean;
  dateFilter?: BoardDateFilter;
}): boolean {
  return Boolean(
    options.query?.trim() ||
      options.tag ||
      options.priorityOnly ||
      (options.dateFilter && options.dateFilter !== "all"),
  );
}

export function collectTags(items: MindtaskerItem[]): string[] {
  const set = new Set<string>();
  items.forEach((item) => item.tags.forEach((tag) => set.add(tag)));
  return [...set].sort();
}

export function unifiedFilterTags(userTags: UserTag[]): string[] {
  return [...userTags]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((tag) => normalizeTagName(tag.name))
    .filter((name) => name.length > 0);
}
