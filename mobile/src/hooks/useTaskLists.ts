import { useCallback, useEffect, useState } from "react";

import type { Id } from "../../../convex/_generated/dataModel";
import {
  archiveTaskList,
  createTaskListsFromTags,
  deleteTaskList,
  listTaskLists,
  refreshTaskListTags,
  renameTaskList,
  restoreTaskList,
  setTaskListReminder,
  subscribeTaskLists,
} from "../lib/task-lists-api";
import { filterTodayBoardTasksByListTags, type TaskListRecord } from "../lib/task-list-items";
import type { MindtaskerItem } from "../lib/supabase";
import {
  cancelItemReminderNotification,
  scheduleItemReminderNotification,
} from "../lib/local-notifications";

export type { TaskListRecord } from "../lib/task-list-items";

export function useTaskLists(userId: string | undefined) {
  const [lists, setLists] = useState<TaskListRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));

  const refresh = useCallback(async () => {
    if (!userId) {
      setLists([]);
      setLoading(false);
      return;
    }
    try {
      const next = await listTaskLists(userId);
      setLists(next);
    } catch (error) {
      console.error("Failed to load task lists", error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    return subscribeTaskLists(userId, () => {
      void refresh();
    });
  }, [userId, refresh]);

  const createFromTags = useCallback(
    async (
      filterTags: string[],
      name: string,
      _boardTasks: MindtaskerItem[] = [],
    ) => {
      if (!userId) return;
      await createTaskListsFromTags(userId, filterTags, name);
      await refresh();
    },
    [refresh, userId],
  );

  const renameList = useCallback(
    async (listId: Id<"taskLists">, name: string) => {
      if (!userId) return;
      await renameTaskList(userId, listId, name);
      await refresh();
    },
    [refresh, userId],
  );

  const refreshListTags = useCallback(
    async (listId: Id<"taskLists">, filterTags: string[]) => {
      if (!userId) return;
      await refreshTaskListTags(userId, listId, filterTags);
      await refresh();
    },
    [refresh, userId],
  );

  const archiveList = useCallback(
    async (listId: Id<"taskLists">) => {
      if (!userId) return;
      await archiveTaskList(userId, listId);
      await refresh();
    },
    [refresh, userId],
  );

  const restoreList = useCallback(
    async (listId: Id<"taskLists">) => {
      if (!userId) return;
      await restoreTaskList(userId, listId);
      await refresh();
    },
    [refresh, userId],
  );

  const deleteList = useCallback(
    async (listId: Id<"taskLists">) => {
      if (!userId) return;
      await deleteTaskList(userId, listId);
      await cancelItemReminderNotification("list", listId);
      await refresh();
    },
    [refresh, userId],
  );

  const refreshListItems = useCallback(
    async (
      _listId: Id<"taskLists">,
      boardTasks: MindtaskerItem[] = [],
      filterTags: string[] = [],
    ) => {
      return filterTodayBoardTasksByListTags(boardTasks, filterTags).length;
    },
    [],
  );

  const setListReminder = useCallback(
    async (listId: Id<"taskLists">, reminderAt: string, listName?: string) => {
      if (!userId) return;
      await setTaskListReminder(userId, listId, reminderAt);
      await scheduleItemReminderNotification({
        kind: "list",
        id: listId,
        title: listName?.trim() || "רשימה",
        dueDateIso: reminderAt,
      });
      await refresh();
    },
    [refresh, userId],
  );

  const clearListReminder = useCallback(
    async (listId: Id<"taskLists">) => {
      if (!userId) return;
      await setTaskListReminder(userId, listId, null);
      await cancelItemReminderNotification("list", listId);
      await refresh();
    },
    [refresh, userId],
  );

  return {
    enabled: Boolean(userId),
    lists,
    loading: Boolean(userId) && loading,
    createFromTags,
    renameList,
    refreshListTags,
    archiveList,
    restoreList,
    deleteList,
    refreshListItems,
    setListReminder,
    clearListReminder,
  };
}
