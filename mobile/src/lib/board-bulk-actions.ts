/** Bulk board actions for multi-select on inbox / tasks / notes. */

export type BoardBulkAction =
  | "complete"
  | "archive"
  | "restore"
  | "delete"
  | "convertToNote"
  | "convertToTask"
  | "sendToBoard";

export type BoardBulkItem = {
  id: string;
  is_actionable: boolean;
  status: string;
};

const OPEN_STATUSES = new Set(["inbox", "pending"]);

export function matchesBulkAction(
  item: BoardBulkItem,
  action: BoardBulkAction,
): boolean {
  switch (action) {
    case "delete":
      return true;
    case "complete":
      return item.is_actionable && OPEN_STATUSES.has(item.status);
    case "archive":
      return OPEN_STATUSES.has(item.status);
    case "restore":
      return item.status === "snoozed_archive" || item.status === "completed";
    case "convertToNote":
      return item.is_actionable;
    case "convertToTask":
      return !item.is_actionable;
    case "sendToBoard":
      return item.status === "inbox";
  }
}

export function itemsForBulkAction<T extends BoardBulkItem>(
  items: T[],
  action: BoardBulkAction,
): T[] {
  return items.filter((item) => matchesBulkAction(item, action));
}

export function bulkActionCounts(
  items: BoardBulkItem[],
): Record<BoardBulkAction, number> {
  return {
    complete: itemsForBulkAction(items, "complete").length,
    archive: itemsForBulkAction(items, "archive").length,
    restore: itemsForBulkAction(items, "restore").length,
    delete: items.length,
    convertToNote: itemsForBulkAction(items, "convertToNote").length,
    convertToTask: itemsForBulkAction(items, "convertToTask").length,
    sendToBoard: itemsForBulkAction(items, "sendToBoard").length,
  };
}

export function sendToBoardBulkLabel(items: BoardBulkItem[]): string {
  const targets = itemsForBulkAction(items, "sendToBoard");
  if (targets.length === 0) return "שלח ללוח";
  const hasTask = targets.some((item) => item.is_actionable);
  const hasNote = targets.some((item) => !item.is_actionable);
  if (hasTask && !hasNote) return "שלח למשימות";
  if (hasNote && !hasTask) return "שלח להערות";
  return "שלח ללוח";
}

export type BoardSelectScope =
  | "inbox-active"
  | "inbox-archive"
  | "today-active"
  | "today-archive"
  | "today-completed"
  | "notes-active"
  | "notes-archive";
