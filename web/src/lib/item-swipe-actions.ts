import type { MindtaskerItem } from "../types";
import type { SwipeAction } from "../components/SwipeableItemCard";

export type BoardSwipeTone = "tasks" | "notes";

export function boardToneForItem(item: MindtaskerItem): BoardSwipeTone {
  return item.is_actionable ? "tasks" : "notes";
}

export function deleteSwipeAction(onTrigger: () => void): SwipeAction {
  return { label: "מחק", icon: "trash", tone: "danger", onTrigger };
}

export function archiveSwipeAction(
  onTrigger: () => void,
  tone: BoardSwipeTone,
): SwipeAction {
  return { label: "ארכיון", icon: "archive", tone, onTrigger };
}

export function inboxTransferLabel(item: MindtaskerItem): string {
  return item.is_actionable ? "משימות" : "הערות";
}

export function approveSwipeAction(item: MindtaskerItem, onTrigger: () => void): SwipeAction {
  return { label: inboxTransferLabel(item), icon: "check", tone: boardToneForItem(item), onTrigger };
}

export function restoreSwipeAction(
  onTrigger: () => void,
  tone: BoardSwipeTone = "tasks",
): SwipeAction {
  return { label: "שחזר", icon: "undo", tone, onTrigger };
}

/** Swipe right → delete. Swipe left → transfer to tasks/notes board. */
export function inboxSwipeActions(
  item: MindtaskerItem,
  onApprove: () => void,
  onDelete: () => void,
): { left: SwipeAction; right: SwipeAction } {
  return {
    left: approveSwipeAction(item, onApprove),
    right: deleteSwipeAction(onDelete),
  };
}

/** Swipe right → delete. Swipe left → archive. */
export function boardSwipeActions(
  onArchive: () => void,
  onDelete: () => void,
  board: BoardSwipeTone,
): { left: SwipeAction; right: SwipeAction } {
  return {
    left: archiveSwipeAction(onArchive, board),
    right: deleteSwipeAction(onDelete),
  };
}

/** Swipe right → delete. Swipe left → restore. */
export function restoreSwipeActions(
  onRestore: () => void,
  onDelete: () => void,
  tone: BoardSwipeTone = "tasks",
): { left: SwipeAction; right: SwipeAction } {
  return {
    left: restoreSwipeAction(onRestore, tone),
    right: deleteSwipeAction(onDelete),
  };
}

export function archiveRestoreLabel(_item: MindtaskerItem): string {
  return "שחזר";
}

/** Task list row — swipe left: archive/restore, swipe right: delete. */
export function taskListSwipeActions(
  archived: boolean,
  onArchiveOrRestore: () => void,
  onDelete: () => void,
): { left: SwipeAction; right: SwipeAction } {
  if (archived) {
    return restoreSwipeActions(onArchiveOrRestore, onDelete, "tasks");
  }
  return boardSwipeActions(onArchiveOrRestore, onDelete, "tasks");
}
