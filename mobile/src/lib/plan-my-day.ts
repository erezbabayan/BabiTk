import type { MindtaskerItem } from "./supabase";
import { isItemDueToday, isItemOverdue, itemDueTimestamp } from "./filter-items";
import { isPriorityItem } from "./item-priority";

export type PlanMyDayItem = Pick<
  MindtaskerItem,
  "id" | "due_date" | "metadata"
> & {
  sort_order?: number;
  created_at?: string;
  last_interacted_at?: string | null;
};

function rank(item: PlanMyDayItem, now: number): number {
  if (isItemOverdue(item, now)) return 0;
  if (isItemDueToday(item, new Date(now))) return 1;
  if (isPriorityItem(item)) return 2;
  if (itemDueTimestamp(item, now) !== null) return 3;
  return 4;
}

export function planMyDayOrder<T extends PlanMyDayItem>(items: T[], now = Date.now()): T[] {
  return [...items].sort((a, b) => {
    const rankDiff = rank(a, now) - rank(b, now);
    if (rankDiff !== 0) return rankDiff;
    const aDue = itemDueTimestamp(a, now);
    const bDue = itemDueTimestamp(b, now);
    if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue;
    if (aDue !== null && bDue === null) return -1;
    if (aDue === null && bDue !== null) return 1;
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
}

export function planMyDayFocus<T extends PlanMyDayItem>(items: T[], now = Date.now()): T[] {
  const today = new Date(now);
  return items.filter(
    (item) =>
      isItemOverdue(item, now) || isItemDueToday(item, today) || isPriorityItem(item),
  );
}
