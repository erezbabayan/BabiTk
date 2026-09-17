import type { MindtaskerItem } from "../types";
import type { UserTag } from "./tags";
import { normalizeTagName } from "./tags";
import { filterItemsByPriority } from "./item-priority";

export type BoardDateFilter = "all" | "today" | "tomorrow" | "overdue" | "undated";

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function filterItemsByQuery(
  items: MindtaskerItem[],
  query: string,
): MindtaskerItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  return items.filter(
    (item) =>
      (item.title ?? "").toLowerCase().includes(q) ||
      (item.content ?? "").toLowerCase().includes(q) ||
      (item.tags ?? []).some((tag) => tag.toLowerCase().includes(q)),
  );
}

export function filterItemsByTag(
  items: MindtaskerItem[],
  tag: string | null,
): MindtaskerItem[] {
  if (!tag) return items;
  return items.filter((item) => (item.tags ?? []).includes(tag));
}

export function itemDueTimestamp(item: { due_date: string | null }): number | null {
  if (!item.due_date) return null;
  const ms = Date.parse(item.due_date);
  return Number.isFinite(ms) ? ms : null;
}

/** True when the item's due date falls on the local calendar day of `now`. */
export function isItemDueToday(item: { due_date: string | null }, now = new Date()): boolean {
  const ts = itemDueTimestamp(item);
  if (ts === null) return false;
  return isSameLocalDay(new Date(ts), now);
}

export function isItemDueTomorrow(item: { due_date: string | null }, now = new Date()): boolean {
  const ts = itemDueTimestamp(item);
  if (ts === null) return false;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameLocalDay(new Date(ts), tomorrow);
}

export function isItemOverdue(item: { due_date: string | null }, now = Date.now()): boolean {
  const ts = itemDueTimestamp(item);
  return ts !== null && ts < now;
}

export function isItemUndated(item: { due_date: string | null }): boolean {
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
  items.forEach((item) => (item.tags ?? []).forEach((tag) => set.add(tag)));
  return [...set].sort();
}

/** Board filter / picker list — always mirrors user tag settings (single source of truth). */
export function unifiedFilterTags(userTags: UserTag[]): string[] {
  return [...userTags]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((tag) => normalizeTagName(tag.name))
    .filter((name) => name.length > 0);
}
