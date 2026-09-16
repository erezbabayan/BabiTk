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
