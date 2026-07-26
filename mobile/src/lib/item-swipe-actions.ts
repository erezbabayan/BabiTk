import type { MindtaskerItem } from "./supabase";
import { inboxTransferLabel } from "./item-actions";
import type { SwipeActionIconName, SwipeActionTone } from "./swipe-action-style";

export interface SwipeSideAction {
  label: string;
  iconName: SwipeActionIconName;
  tone: SwipeActionTone;
  onTrigger: () => void;
}

type Tab = "inbox" | "today" | "notes";
type ListView = "active" | "archive" | "completed";
type BoardSwipeTone = "tasks" | "notes";

interface BoardActions {
  approveItem: (item: MindtaskerItem) => void | Promise<void>;
  archiveItem: (item: MindtaskerItem) => void | Promise<void>;
  restoreArchiveItem: (item: MindtaskerItem) => void | Promise<void>;
  restoreCompletedTask: (item: MindtaskerItem) => void | Promise<void>;
}

function boardToneForItem(item: MindtaskerItem): BoardSwipeTone {
  return item.is_actionable ? "tasks" : "notes";
}

function deleteAction(onDelete: () => void): SwipeSideAction {
  return {
    label: "מחק",
    iconName: "trash",
    tone: "danger",
    onTrigger: onDelete,
  };
}

function transferAction(item: MindtaskerItem, onApprove: () => void): SwipeSideAction {
  return {
    label: inboxTransferLabel(item),
    iconName: "check",
    tone: boardToneForItem(item),
    onTrigger: onApprove,
  };
}

function archiveAction(onArchive: () => void, tab: Tab): SwipeSideAction {
  return {
    label: "ארכיון",
    iconName: "archive",
    tone: tab === "notes" ? "notes" : "tasks",
    onTrigger: onArchive,
  };
}

function restoreAction(onRestore: () => void, tone: BoardSwipeTone): SwipeSideAction {
  return {
    label: "שחזר",
    iconName: "undo",
    tone,
    onTrigger: onRestore,
  };
}

/** Swipe right → delete. Swipe left → transfer / archive / restore. */
export function buildMobileSwipeActions(
  tab: Tab,
  listView: ListView,
  item: MindtaskerItem,
  board: BoardActions,
  onDelete: () => void,
): { leftAction?: SwipeSideAction; rightAction?: SwipeSideAction } {
  if (listView === "archive") {
    const tone = tab === "notes" ? "notes" : boardToneForItem(item);
    return {
      leftAction: deleteAction(onDelete),
      rightAction: restoreAction(() => void board.restoreArchiveItem(item), tone),
    };
  }

  if (listView === "completed") {
    return {
      leftAction: deleteAction(onDelete),
      rightAction: restoreAction(() => void board.restoreCompletedTask(item), "tasks"),
    };
  }

  if (tab === "inbox") {
    return {
      leftAction: deleteAction(onDelete),
      rightAction: transferAction(item, () => void board.approveItem(item)),
    };
  }

  if (tab === "today" || tab === "notes") {
    return {
      leftAction: deleteAction(onDelete),
      rightAction: archiveAction(() => void board.archiveItem(item), tab),
    };
  }

  return { leftAction: deleteAction(onDelete) };
}

export function buildTaskListSwipeActions(
  archived: boolean,
  onArchiveOrRestore: () => void,
  onDelete: () => void,
): { leftAction: SwipeSideAction; rightAction: SwipeSideAction } {
  if (archived) {
    return {
      leftAction: deleteAction(onDelete),
      rightAction: restoreAction(onArchiveOrRestore, "tasks"),
    };
  }
  return {
    leftAction: deleteAction(onDelete),
    rightAction: archiveAction(onArchiveOrRestore, "today"),
  };
}
