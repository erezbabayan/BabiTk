import type { MindtaskerItem } from "./supabase";

export type DashboardColumn = "inbox" | "today" | "notes";

export function getItemColumn(item: MindtaskerItem): DashboardColumn | null {
  if (item.status === "inbox") return "inbox";
  if (item.status === "pending" && item.is_actionable) return "today";
  if (item.status === "pending" && !item.is_actionable) return "notes";
  return null;
}

export function itemsInColumn(
  items: MindtaskerItem[],
  column: DashboardColumn,
): MindtaskerItem[] {
  return items.filter((item) => getItemColumn(item) === column);
}

export function sortColumnItems(list: MindtaskerItem[]): MindtaskerItem[] {
  return [...list].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
}

export function buildColumnMovePatch(target: DashboardColumn): Partial<MindtaskerItem> {
  const patch: Partial<MindtaskerItem> = {
    last_interacted_at: new Date().toISOString(),
  };

  switch (target) {
    case "inbox":
      patch.status = "inbox";
      break;
    case "today":
      patch.status = "pending";
      patch.is_actionable = true;
      break;
    case "notes":
      patch.status = "pending";
      patch.is_actionable = false;
      patch.due_date = null;
      break;
  }

  return patch;
}
