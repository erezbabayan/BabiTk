import type { MindtaskerItem } from "../types";

export type BoardDateSortDirection = "asc" | "desc" | null;

export function nextDateSortDirection(
  current: BoardDateSortDirection,
): BoardDateSortDirection {
  if (current === null) return "desc";
  if (current === "desc") return "asc";
  return null;
}

function parseItemDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Prefer due date, then last update/interaction, then created. */
function itemSortTimestamp(item: MindtaskerItem): number | null {
  return (
    parseItemDate(item.due_date) ??
    parseItemDate(item.last_interacted_at) ??
    parseItemDate(item.updated_at) ??
    parseItemDate(item.created_at)
  );
}

export function applyBoardDateSort(
  list: MindtaskerItem[],
  direction: BoardDateSortDirection,
): MindtaskerItem[] {
  if (!direction) return list;

  const factor = direction === "asc" ? 1 : -1;

  return [...list].sort((a, b) => {
    const aTs = itemSortTimestamp(a);
    const bTs = itemSortTimestamp(b);

    if (aTs !== null && bTs !== null && aTs !== bTs) {
      return (aTs - bTs) * factor;
    }
    if (aTs !== null && bTs === null) return -1;
    if (aTs === null && bTs !== null) return 1;

    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
}
