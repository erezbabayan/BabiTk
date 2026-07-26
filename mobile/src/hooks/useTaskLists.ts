import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useConvexFeatures } from "../lib/data-backend";
import {
  normalizeTaskListRecord,
  resolveBoardSourceTaskIds,
  type TaskListRecord,
} from "../lib/task-list-items";
import type { MindtaskerItem } from "../lib/supabase";
import {
  cancelItemReminderNotification,
  scheduleItemReminderNotification,
} from "../lib/local-notifications";

export type { TaskListRecord } from "../lib/task-list-items";

export function useTaskLists(userId: Id<"users"> | undefined) {
  const features = useConvexFeatures();
  const queryEnabled = features && Boolean(userId);

  const rawLists = useQuery(
    api.taskLists.listForUser,
    queryEnabled ? { userId: userId!, includeArchived: true } : "skip",
  );

  const createMutation = useMutation(api.taskLists.createListsFromTags);
  const updateMutation = useMutation(api.taskLists.updateList);
  const archiveMutation = useMutation(api.taskLists.archiveList);
  const restoreMutation = useMutation(api.taskLists.restoreList);
  const deleteMutation = useMutation(api.taskLists.deleteList);
  const backfillMutation = useMutation(api.taskLists.backfillEmptyLists);
  const refreshListItemsMutation = useMutation(api.taskLists.refreshListItems);
  const backfillAttempted = useRef(false);

  const lists = useMemo(
    () => (rawLists ?? []).map(normalizeTaskListRecord),
    [rawLists],
  );

  useEffect(() => {
    if (!queryEnabled || !userId || rawLists === undefined) return;

    const needsBackfill = rawLists.some(
      (list) => (list.items?.length ?? 0) === 0 && (list.filterTags?.length ?? 0) > 0,
    );
    if (!needsBackfill || backfillAttempted.current) return;

    backfillAttempted.current = true;
    void backfillMutation({ userId }).catch((error) => {
      console.error("Task list backfill failed", error);
      backfillAttempted.current = false;
    });
  }, [backfillMutation, queryEnabled, rawLists, userId]);

  const createFromTags = useCallback(
    async (
      filterTags: string[],
      name: string,
      boardTasks: MindtaskerItem[] = [],
    ) => {
      if (!userId) return;
      const normalizedTags = [
        ...new Set(filterTags.map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean)),
      ];
      if (normalizedTags.length === 0) return;

      const sourceTaskIdsByTag = normalizedTags.map((tag) =>
        resolveBoardSourceTaskIds(boardTasks, [tag]),
      );

      return await createMutation({
        userId,
        filterTags: normalizedTags,
        ...(normalizedTags.length === 1 && name.trim() ? { name: name.trim() } : {}),
        ...(sourceTaskIdsByTag.some((ids) => ids.length > 0)
          ? { sourceTaskIdsByTag }
          : {}),
      });
    },
    [createMutation, userId],
  );

  const renameList = useCallback(
    async (listId: Id<"taskLists">, name: string) => {
      if (!userId) return;
      await updateMutation({ userId, listId, name });
    },
    [updateMutation, userId],
  );

  const refreshListTags = useCallback(
    async (listId: Id<"taskLists">, filterTags: string[]) => {
      if (!userId) return;
      await updateMutation({ userId, listId, filterTags });
    },
    [updateMutation, userId],
  );

  const archiveList = useCallback(
    async (listId: Id<"taskLists">) => {
      if (!userId) return;
      await archiveMutation({ userId, listId });
    },
    [archiveMutation, userId],
  );

  const restoreList = useCallback(
    async (listId: Id<"taskLists">) => {
      if (!userId) return;
      await restoreMutation({ userId, listId });
    },
    [restoreMutation, userId],
  );

  const deleteList = useCallback(
    async (listId: Id<"taskLists">) => {
      if (!userId) return;
      await deleteMutation({ userId, listId });
    },
    [deleteMutation, userId],
  );

  const refreshListItems = useCallback(
    async (
      listId: Id<"taskLists">,
      boardTasks: MindtaskerItem[] = [],
      filterTags: string[] = [],
    ) => {
      if (!userId) return 0;
      const sourceTaskIds = resolveBoardSourceTaskIds(boardTasks, filterTags);
      return await refreshListItemsMutation({
        userId,
        listId,
        ...(sourceTaskIds.length > 0 ? { sourceTaskIds } : {}),
      });
    },
    [refreshListItemsMutation, userId],
  );

  const setListReminder = useCallback(
    async (listId: Id<"taskLists">, reminderAt: string, listName?: string) => {
      if (!userId) return;
      await updateMutation({ userId, listId, reminderAt });
      await scheduleItemReminderNotification({
        kind: "list",
        id: listId,
        title: listName?.trim() || "רשימה",
        dueDateIso: reminderAt,
      });
    },
    [updateMutation, userId],
  );

  const clearListReminder = useCallback(
    async (listId: Id<"taskLists">) => {
      if (!userId) return;
      await updateMutation({ userId, listId, reminderAt: null });
      await cancelItemReminderNotification("list", listId);
    },
    [updateMutation, userId],
  );

  return {
    enabled: features,
    lists,
    loading: features && (!userId || rawLists === undefined),
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
