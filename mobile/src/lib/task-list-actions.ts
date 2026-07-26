import type { MindtaskerItem } from "./supabase";

export interface TaskListUndoHandlers {
  restoreDeletedItem: (item: MindtaskerItem) => void | Promise<void>;
  restoreArchiveItem: (item: MindtaskerItem) => void | Promise<void>;
  restoreCompletedTask: (item: MindtaskerItem) => void | Promise<void>;
}

/** Undo archive, completion, or soft-delete from a task list row. */
export function undoTaskListItem(
  item: MindtaskerItem,
  handlers: TaskListUndoHandlers,
): void {
  if (item.deleted_at) {
    void handlers.restoreDeletedItem(item);
    return;
  }
  if (item.status === "snoozed_archive") {
    void handlers.restoreArchiveItem(item);
    return;
  }
  if (item.status === "completed") {
    void handlers.restoreCompletedTask(item);
  }
}
