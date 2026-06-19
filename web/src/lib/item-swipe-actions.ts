import type { MindtaskerItem } from "../types";
import type { SwipeAction } from "../components/SwipeableItemCard";

export function deleteSwipeAction(onTrigger: () => void): SwipeAction {
  return { label: "מחק", icon: "🗑", tone: "danger", onTrigger };
}

export function archiveSwipeAction(onTrigger: () => void): SwipeAction {
  return { label: "ארכיון", icon: "📦", tone: "neutral", onTrigger };
}

export function approveSwipeAction(onTrigger: () => void): SwipeAction {
  return { label: "אשר", icon: "✓", tone: "success", onTrigger };
}

export function restoreSwipeAction(onTrigger: () => void): SwipeAction {
  return { label: "שחזר", icon: "↩", tone: "success", onTrigger };
}

/** Swipe right → delete. Swipe left → primary action (approve / archive / restore). */
export function inboxSwipeActions(
  onApprove: () => void,
  onDelete: () => void,
): { left: SwipeAction; right: SwipeAction } {
  return {
    left: approveSwipeAction(onApprove),
    right: deleteSwipeAction(onDelete),
  };
}

export function boardSwipeActions(
  onArchive: () => void,
  onDelete: () => void,
): { left: SwipeAction; right: SwipeAction } {
  return {
    left: archiveSwipeAction(onArchive),
    right: deleteSwipeAction(onDelete),
  };
}

export function restoreSwipeActions(
  onRestore: () => void,
  onDelete: () => void,
): { left: SwipeAction; right: SwipeAction } {
  return {
    left: restoreSwipeAction(onRestore),
    right: deleteSwipeAction(onDelete),
  };
}

export function archiveRestoreLabel(_item: MindtaskerItem): string {
  return "שחזר";
}
