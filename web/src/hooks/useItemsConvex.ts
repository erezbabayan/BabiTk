import { useCallback } from "react";

import type { Id } from "../lib/ids";
import type { MindtaskerItem } from "../types";

const noopRefresh = async () => {};

export type BoardSecondaryLoad = {
  inboxArchive?: boolean;
  notesArchive?: boolean;
  completed?: boolean;
};

function useItemsConvexOffline(
  _userId: Id<"users"> | undefined,
  _enabled: boolean,
  _secondary: BoardSecondaryLoad = {},
) {
  const noop = useCallback(async () => {}, []);
  return {
    loading: false,
    inbox: [] as MindtaskerItem[],
    todayTasks: [] as MindtaskerItem[],
    notes: [] as MindtaskerItem[],
    inboxArchive: [] as MindtaskerItem[],
    notesArchive: [] as MindtaskerItem[],
    completedTasks: [] as MindtaskerItem[],
    toggleActionable: noop,
    approveInboxItem: noop,
    completeTask: noop,
    snoozeTask: noop,
    clearReminder: noop,
    markReminderFired: noop,
    restoreArchiveItem: noop,
    archiveItem: noop,
    deleteItem: noop,
    restoreDeletedItem: noop,
    restoreCompletedTask: noop,
    editItem: noop,
    updateTags: noop,
    togglePriority: noop,
    toggleChecklist: noop,
    moveToColumn: noop,
    placeItem: noop,
    refresh: noopRefresh,
  };
}

export const useItemsConvex = useItemsConvexOffline;
