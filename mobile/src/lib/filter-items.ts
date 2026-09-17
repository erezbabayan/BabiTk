import type { MindtaskerItem } from "./supabase";
import type { UserTag } from "./tags";
import { normalizeTagName } from "./tags";
import { filterItemsByPriority } from "./item-priority";
import { getItemAnalysis } from "./item-analysis";

type BoardDateItem = Pick<MindtaskerItem, "due_date" | "metadata">;

/**
 * Stored schedule used by date chips: due_date, then analysis target/notify.
 * Does not infer a default reminder — that would hide every undated task.
 */
export function itemBoardScheduleIso(item: BoardDateItem): string | null {
  if (item.due_date && item.due_date.trim()) return item.due_date;
  const analysis = getItemAnalysis(item.metadata);
  const fromAnalysis = analysis?.target_at || analysis?.notify_at;
  return fromAnalysis && fromAnalysis.trim() ? fromAnalysis : null;
}

export type BoardDateFilter = "all" | "today" | "overdue" | "undated";

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

export function applyBoardItemFilters(
  items: MindtaskerItem[],
  tag: string | null,
  priorityOnly: boolean,
  dateFilter: BoardDateFilter | boolean = "all",
  now = new Date(),
): MindtaskerItem[] {
  const resolved: BoardDateFilter =
    dateFilter === true ? "today" : dateFilter === false ? "all" : dateFilter;
  return filterItemsByDateFilter(
    filterItemsByPriority(filterItemsByTag(items, tag), priorityOnly),
    resolved,
    now,
  );
}

export function parseItemDueDate(item: BoardDateItem): Date | null {
  const iso = itemBoardScheduleIso(item);
  if (!iso) return null;
  const due = new Date(iso);
  return Number.isNaN(due.getTime()) ? null : due;
}

export function isItemUndated(item: BoardDateItem): boolean {
  return parseItemDueDate(item) === null;
}

/** True when the item's due date falls on the local calendar day of `now`. */
export function isItemDueToday(item: BoardDateItem, now = new Date()): boolean {
  const due = parseItemDueDate(item);
  if (!due) return false;
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

export function isItemDateOverdue(item: BoardDateItem, now = new Date()): boolean {
  const due = parseItemDueDate(item);
  if (!due) return false;
  return due.getTime() < now.getTime();
}

export function filterItemsDueToday(
  items: MindtaskerItem[],
  todayOnly: boolean,
  now = new Date(),
): MindtaskerItem[] {
  if (!todayOnly) return items;
  return items.filter((item) => isItemDueToday(item, now));
}

export function filterItemsByDateFilter(
  items: MindtaskerItem[],
  dateFilter: BoardDateFilter,
  now = new Date(),
): MindtaskerItem[] {
  if (dateFilter === "all") return items;
  if (dateFilter === "today") return items.filter((item) => isItemDueToday(item, now));
  if (dateFilter === "overdue") return items.filter((item) => isItemDateOverdue(item, now));
  return items.filter((item) => isItemUndated(item));
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
