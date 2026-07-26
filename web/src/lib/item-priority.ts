import type { MindtaskerItem } from "../types";

export const PRIORITY_METADATA_KEY = "priority";

export function isPriorityItem(item: { metadata?: Record<string, unknown> | null }): boolean {
  return item.metadata?.[PRIORITY_METADATA_KEY] === true;
}

export function patchPriorityMetadata(
  metadata: unknown,
  priority: boolean,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object"
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  if (priority) {
    base[PRIORITY_METADATA_KEY] = true;
  } else {
    delete base[PRIORITY_METADATA_KEY];
  }
  return base;
}

export function buildPriorityTogglePatch(
  item: MindtaskerItem,
  priority: boolean,
): Pick<MindtaskerItem, "metadata"> & { last_interacted_at: string } {
  return {
    metadata: patchPriorityMetadata(item.metadata, priority),
    last_interacted_at: new Date().toISOString(),
  };
}

export function filterItemsByPriority<T extends { metadata?: Record<string, unknown> | null }>(
  items: T[],
  priorityOnly: boolean,
): T[] {
  if (!priorityOnly) return items;
  return items.filter(isPriorityItem);
}
