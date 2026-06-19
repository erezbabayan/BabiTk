import type { MindtaskerItem } from "../types";

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

export function collectTags(items: MindtaskerItem[]): string[] {
  const set = new Set<string>();
  items.forEach((item) => item.tags.forEach((tag) => set.add(tag)));
  return [...set].sort();
}
