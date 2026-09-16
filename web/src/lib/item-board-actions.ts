import type { MindtaskerItem } from "../types";
import {
  buildToggleStayMetadata,
  withPinnedBoardColumn,
} from "./item-columns";
import {
  buildInferredReminderPatch,
  getReminderFlags,
} from "./resolve-item-reminder";

export type BoardActionItem = Pick<
  MindtaskerItem,
  | "title"
  | "content"
  | "status"
  | "is_actionable"
  | "due_date"
  | "completed_at"
  | "metadata"
>;

/** Flip note ↔ task. Inbox stays inbox; pending items move with type. */
export function buildToggleActionablePatch(
  item: BoardActionItem,
): Record<string, unknown> {
  const becomesTask = !item.is_actionable;
  const patch: Record<string, unknown> = {
    is_actionable: becomesTask,
    last_interacted_at: new Date().toISOString(),
    metadata: buildToggleStayMetadata(item),
  };

  if (becomesTask) {
    const reminder = buildInferredReminderPatch({
      ...item,
      is_actionable: true,
    });
    patch.due_date = reminder.due_date;
    const metadata = {
      ...buildToggleStayMetadata(item),
      ...(reminder.metadata ?? {}),
    };
    delete metadata.board_column;
    patch.metadata = metadata;
    return patch;
  }

  const flags = getReminderFlags(item.metadata);
  if (!flags.manual) {
    patch.due_date = null;
  }
  patch.completed_at = null;
  if (item.status === "completed") {
    patch.status = "pending";
  }
  return patch;
}

/** Send an inbox item to its tasks/notes board. */
export function buildApproveInboxPatch(
  item: BoardActionItem,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    status: "pending",
    last_interacted_at: new Date().toISOString(),
    metadata: withPinnedBoardColumn(item.metadata, null),
  };

  if (!item.is_actionable) {
    return patch;
  }

  const reminder = buildInferredReminderPatch(item);
  patch.due_date = reminder.due_date;
  const metadata = {
    ...withPinnedBoardColumn(item.metadata, null),
    ...(reminder.metadata ?? {}),
  };
  delete metadata.board_column;
  patch.metadata = metadata;
  return patch;
}

export function buildCompleteTaskPatch(): Record<string, unknown> {
  return {
    status: "completed",
    completed_at: new Date().toISOString(),
    last_interacted_at: new Date().toISOString(),
  };
}

/** Pixels of leftward mouse/touch drag that means "send inbox item to its board". */
export const INBOX_LEFT_TRANSFER_PX = 36;

export type InboxDragDecision = "approve" | "place" | "none";

/**
 * Inbox "drag left" is transfer-to-own-board, not a same-column reorder.
 * Dropping on tasks/notes is an explicit place. A cancelled drag that moved
 * left still approves, because the destination columns are often farther
 * than a natural swipe.
 */
export function resolveInboxDragTransfer(options: {
  sourceColumn: "inbox" | "today" | "notes" | null;
  dropColumn: "inbox" | "today" | "notes" | null;
  startX: number;
  endX: number;
  thresholdPx?: number;
}): InboxDragDecision {
  const threshold = options.thresholdPx ?? INBOX_LEFT_TRANSFER_PX;
  const draggedLeft = options.endX <= options.startX - threshold;

  if (options.sourceColumn !== "inbox") {
    return options.dropColumn ? "place" : "none";
  }

  if (options.dropColumn === "today" || options.dropColumn === "notes") {
    return "place";
  }

  if (draggedLeft) {
    return "approve";
  }

  return options.dropColumn === "inbox" ? "place" : "none";
}

/** Swipe offset: negative X (left) or positive X (right). */
export function resolveSwipeRelease(
  offsetPx: number,
  thresholdPx: number,
): "left" | "right" | null {
  if (offsetPx >= thresholdPx) return "right";
  if (offsetPx <= -thresholdPx) return "left";
  return null;
}
