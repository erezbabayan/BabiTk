import type { MindtaskerItem } from "./supabase";
import type { UserTag } from "./tags";
import { normalizeTagName } from "./tags";
import { filterItemsByPriority } from "./item-priority";

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
  todayOnly = false,
): MindtaskerItem[] {
  return filterItemsDueToday(
    filterItemsByPriority(filterItemsByTag(items, tag), priorityOnly),
    todayOnly,
  );
}

/** True when the item's due date falls on the local calendar day of `now`. */
export function isItemDueToday(item: MindtaskerItem, now = new Date()): boolean {
  if (!item.due_date) return false;
  const due = new Date(item.due_date);
  if (Number.isNaN(due.getTime())) return false;
  return (
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate()
  );
}

export function filterItemsDueToday(
  items: MindtaskerItem[],
  todayOnly: boolean,
  now = new Date(),
): MindtaskerItem[] {
  if (!todayOnly) return items;
  return items.filter((item) => isItemDueToday(item, now));
}

export function collectTags(items: MindtaskerItem[]): string[] {
  const set = new Set<string>();
  items.forEach((item) => item.tags.forEach((tag) => set.add(tag)));
  return [...set].sort();
}

/** Board filter / picker list — always mirrors user tag settings (single source of truth). */
export function unifiedFilterTags(userTags: UserTag[]): string[] {
  return [...userTags]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((tag) => normalizeTagName(tag.name))
    .filter((name) => name.length > 0);
}
