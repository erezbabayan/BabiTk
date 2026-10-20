import type { MindtaskerItem } from "./supabase";

export type DashboardColumn = "inbox" | "today" | "notes";

/** Legacy pin key — cleared on toggle/move so boards follow type. */
export const BOARD_COLUMN_META_KEY = "board_column";

export function withPinnedBoardColumn(
  metadata: Record<string, unknown> | null | undefined,
  column: "today" | "notes" | null,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(metadata ?? {}) };
  if (column) {
    next[BOARD_COLUMN_META_KEY] = column;
  } else {
    delete next[BOARD_COLUMN_META_KEY];
  }
  return next;
}

/**
 * Board placement:
 * - inbox status → מחברת (type only changes accent color)
 * - pending + task → משימות
 * - pending + note → רעיונות
 */
export function getItemColumn(item: MindtaskerItem): DashboardColumn | null {
  if (item.status === "inbox") return "inbox";
  if (item.status === "pending") {
    return item.is_actionable ? "today" : "notes";
  }
  return null;
}

export function isActiveBoardItem(
  item: Pick<MindtaskerItem, "deleted_at">,
): boolean {
  return !item.deleted_at;
}

/** Tasks board archive: snoozed + completed, without duplicate ids. */
export function mergeTaskArchiveItems<T extends { id: string }>(
  archived: T[],
  completed: T[],
): T[] {
  const merged = [...archived];
  const seen = new Set(merged.map((item) => item.id));
  for (const item of completed) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

export function itemsInColumn(
  items: MindtaskerItem[],
  column: DashboardColumn,
): MindtaskerItem[] {
  return items.filter(
    (item) => isActiveBoardItem(item) && getItemColumn(item) === column,
  );
}

export function sortColumnItems(list: MindtaskerItem[]): MindtaskerItem[] {
  return [...list].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
}

export function buildColumnMovePatch(
  target: DashboardColumn,
  currentMetadata?: Record<string, unknown> | null,
): Partial<MindtaskerItem> {
  const patch: Partial<MindtaskerItem> = {
    last_interacted_at: new Date().toISOString(),
  };

  switch (target) {
    case "inbox":
      patch.status = "inbox";
      patch.metadata = withPinnedBoardColumn(currentMetadata, null);
      break;
    case "today":
      patch.status = "pending";
      patch.is_actionable = true;
      patch.metadata = withPinnedBoardColumn(currentMetadata, null);
      break;
    case "notes":
      patch.status = "pending";
      patch.is_actionable = false;
      patch.due_date = null;
      patch.completed_at = null;
      patch.metadata = withPinnedBoardColumn(currentMetadata, null);
      break;
  }

  return patch;
}

/** Clear board pin so type flip can move pending items between today/notes. */
export function buildToggleStayMetadata(
  item: Pick<MindtaskerItem, "status" | "is_actionable" | "metadata">,
): Record<string, unknown> {
  return withPinnedBoardColumn(item.metadata, null);
}

/** Apply a note↔task flip from the edit form onto the current item. */
export function withEditedItemType(
  item: MindtaskerItem,
  isActionable: boolean,
): MindtaskerItem {
  if (item.is_actionable === isActionable) return item;
  const next: MindtaskerItem = {
    ...item,
    is_actionable: isActionable,
    metadata: buildToggleStayMetadata(item),
  };
  if (!isActionable) {
    next.completed_at = null;
    if (item.status === "completed") next.status = "pending";
  }
  return next;
}
