import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  asConvexItemId,
  convexItemToMindtasker,
  mindtaskerPatchToConvex,
} from "../lib/convex-items";
import {
  applyColumnPatch,
  buildColumnMovePatch,
  getItemColumn,
  itemsInColumn,
  sortColumnItems,
  withPinnedBoardColumn,
  type DashboardColumn,
} from "../lib/item-columns";
import {
  buildArchivePatch,
  buildSoftDeletePatch,
  resolveRestoreFromArchivePatch,
  resolveRestoreFromTrashPatch,
} from "../lib/item-restore";
import type { ItemEditInput } from "../components/ItemEditModal";
import type { MindtaskerItem } from "../types";
import {
  buildClearReminderPatch,
  buildInferredReminderPatch,
  buildManualReminderPatch,
  buildTaskReminderUpdate,
  type ReminderRecurrence,
} from "../lib/resolve-item-reminder";
import { buildPriorityTogglePatch } from "../lib/item-priority";
import { isDemoMode } from "../lib/supabase";

const noopRefresh = async () => {};

const OFFLINE =
  isDemoMode || import.meta.env.VITE_USE_CONVEX === "false";

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
    restoreArchiveItem: noop,
    archiveItem: noop,
    deleteItem: noop,
    restoreDeletedItem: noop,
    restoreCompletedTask: noop,
    editItem: noop,
    updateTags: noop,
    togglePriority: noop,
    moveToColumn: noop,
    placeItem: noop,
    refresh: noopRefresh,
  };
}

function useItemsConvexOnline(
  userId: Id<"users"> | undefined,
  enabled: boolean,
  secondary: BoardSecondaryLoad = {},
) {
  const queryArgs = enabled && userId ? { userId } : "skip";
  const loadInboxArchive = Boolean(secondary.inboxArchive);
  const loadNotesArchive = Boolean(secondary.notesArchive);
  const loadCompleted = Boolean(secondary.completed);

  const rawInbox = useQuery(
    api.items.listBoardColumn,
    queryArgs === "skip" ? "skip" : { ...queryArgs, column: "inbox" },
  );
  const rawToday = useQuery(
    api.items.listBoardColumn,
    queryArgs === "skip" ? "skip" : { ...queryArgs, column: "today" },
  );
  const rawNotes = useQuery(
    api.items.listBoardColumn,
    queryArgs === "skip" ? "skip" : { ...queryArgs, column: "notes" },
  );
  const rawInboxArchive = useQuery(
    api.items.listBoardSecondary,
    queryArgs === "skip" || !loadInboxArchive
      ? "skip"
      : { ...queryArgs, bucket: "inbox_archive" },
  );
  const rawNotesArchive = useQuery(
    api.items.listBoardSecondary,
    queryArgs === "skip" || !loadNotesArchive
      ? "skip"
      : { ...queryArgs, bucket: "notes_archive" },
  );
  const rawCompleted = useQuery(
    api.items.listBoardSecondary,
    queryArgs === "skip" || !loadCompleted
      ? "skip"
      : { ...queryArgs, bucket: "completed" },
  );

  const updateMutation = useMutation(api.items.update);
  const toggleMutation = useMutation(api.items.toggleActionable);
  const ensureSoonReminder = useMutation(api.notifications.ensureSoonReminder);

  const mapRows = useCallback(
    (rows: typeof rawInbox) => (rows ?? []).map(convexItemToMindtasker),
    [],
  );

  const inbox = useMemo(() => sortColumnItems(mapRows(rawInbox)), [mapRows, rawInbox]);
  const todayTasks = useMemo(() => sortColumnItems(mapRows(rawToday)), [mapRows, rawToday]);
  const notes = useMemo(() => sortColumnItems(mapRows(rawNotes)), [mapRows, rawNotes]);
  const inboxArchive = useMemo(
    () => (loadInboxArchive ? mapRows(rawInboxArchive) : []),
    [loadInboxArchive, mapRows, rawInboxArchive],
  );
  const notesArchive = useMemo(
    () => (loadNotesArchive ? mapRows(rawNotesArchive) : []),
    [loadNotesArchive, mapRows, rawNotesArchive],
  );
  const completedTasks = useMemo(
    () => (loadCompleted ? mapRows(rawCompleted) : []),
    [loadCompleted, mapRows, rawCompleted],
  );

  const items = useMemo(
    () => [...inbox, ...todayTasks, ...notes, ...inboxArchive, ...notesArchive, ...completedTasks],
    [inbox, todayTasks, notes, inboxArchive, notesArchive, completedTasks],
  );

  const loading =
    enabled && userId
      ? rawInbox === undefined || rawToday === undefined || rawNotes === undefined
      : false;

  const updateItem = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      if (!userId) throw new Error("משתמש לא מחובר");
      await updateMutation({
        userId,
        itemId: asConvexItemId(id),
        patch: mindtaskerPatchToConvex(patch),
      });
    },
    [updateMutation, userId],
  );

  const applyItemPatches = useCallback(
    async (updates: { id: string; patch: Record<string, unknown> }[]) => {
      if (!userId || updates.length === 0) return;

      const merged = new Map<string, Record<string, unknown>>();
      for (const { id, patch } of updates) {
        merged.set(id, { ...(merged.get(id) ?? {}), ...patch });
      }

      await Promise.all(
        [...merged.entries()].map(([id, patch]) =>
          updateMutation({
            userId,
            itemId: asConvexItemId(id),
            patch: mindtaskerPatchToConvex(patch),
          }),
        ),
      );
    },
    [updateMutation, userId],
  );

  const toggleActionable = useCallback(
    async (item: MindtaskerItem) => {
      if (!userId) throw new Error("משתמש לא מחובר");
      const becomesTask = !item.is_actionable;
      try {
        if (becomesTask) {
          const reminder = buildInferredReminderPatch({
            ...item,
            is_actionable: true,
          });
          await toggleMutation({
            userId,
            itemId: asConvexItemId(item.id),
            dueDate: reminder.due_date,
            metadata: reminder.metadata,
          });
        } else {
          await toggleMutation({
            userId,
            itemId: asConvexItemId(item.id),
          });
        }
      } catch (error) {
        console.error("toggleActionable failed", error);
        throw error;
      }
    },
    [toggleMutation, userId],
  );

  const approveInboxItem = useCallback(
    async (item: MindtaskerItem) => {
      const patch: Record<string, unknown> = {
        status: "pending",
        last_interacted_at: new Date().toISOString(),
        metadata: withPinnedBoardColumn(item.metadata, null),
      };
      if (item.is_actionable) {
        const reminder = buildInferredReminderPatch(item);
        patch.due_date = reminder.due_date;
        patch.metadata = {
          ...withPinnedBoardColumn(item.metadata, null),
          ...(reminder.metadata ?? {}),
        };
        delete (patch.metadata as Record<string, unknown>).board_column;
      }
      await updateItem(item.id, patch);
    },
    [updateItem],
  );

  const completeTask = useCallback(
    async (item: MindtaskerItem) => {
      await updateItem(item.id, {
        status: "completed",
        completed_at: new Date().toISOString(),
        last_interacted_at: new Date().toISOString(),
      });
    },
    [updateItem],
  );

  const snoozeTask = useCallback(
    async (
      item: MindtaskerItem,
      dueDate: string,
      recurrence?: ReminderRecurrence | null,
    ) => {
      const reminder = buildManualReminderPatch(item, dueDate, recurrence);
      await updateItem(item.id, {
        ...reminder,
        last_interacted_at: new Date().toISOString(),
      });
      const fireAt = reminder.due_date ?? dueDate;
      try {
        await ensureSoonReminder({
          kind: item.is_actionable ? "task" : "notebook",
          ...(item.is_actionable
            ? { taskId: asConvexItemId(item.id) as Id<"tasks"> }
            : { notebookId: asConvexItemId(item.id) as Id<"notebooks"> }),
          title: item.title,
          fireAt,
        });
      } catch (error) {
        console.warn("ensureSoonReminder failed", error);
      }
    },
    [ensureSoonReminder, updateItem],
  );

  const clearReminder = useCallback(
    async (item: MindtaskerItem) => {
      const reminder = buildClearReminderPatch(item);
      await updateItem(item.id, {
        ...reminder,
        last_interacted_at: new Date().toISOString(),
      });
    },
    [updateItem],
  );

  const restoreArchiveItem = useCallback(
    async (item: MindtaskerItem) => {
      await updateItem(item.id, resolveRestoreFromArchivePatch(item));
    },
    [updateItem],
  );

  const archiveItem = useCallback(
    async (item: MindtaskerItem) => {
      await updateItem(item.id, buildArchivePatch(item));
    },
    [updateItem],
  );

  const deleteItem = useCallback(
    async (item: MindtaskerItem) => {
      await updateItem(item.id, buildSoftDeletePatch(item));
    },
    [updateItem],
  );

  const restoreDeletedItem = useCallback(
    async (item: MindtaskerItem) => {
      await updateItem(item.id, resolveRestoreFromTrashPatch(item));
    },
    [updateItem],
  );

  const restoreCompletedTask = useCallback(
    async (item: MindtaskerItem) => {
      await updateItem(item.id, {
        status: "pending",
        completed_at: null,
        last_interacted_at: new Date().toISOString(),
      });
    },
    [updateItem],
  );

  const editItem = useCallback(
    async (item: MindtaskerItem, input: ItemEditInput) => {
      const title = input.title.trim();
      if (!title) throw new Error("כותרת חובה");

      const patch: Record<string, unknown> = {
        title,
        content: input.content.trim(),
        tags: input.tags,
        last_interacted_at: new Date().toISOString(),
      };
      const reminder = buildTaskReminderUpdate(item, {
        title,
        content: input.content.trim(),
        due_date: input.due_date,
        recurrence: input.recurrence,
      });
      patch.due_date = reminder.dueDate;
      patch.metadata = reminder.metadata;
      await updateItem(item.id, patch);
      if (reminder.dueDate) {
        try {
          await ensureSoonReminder({
            kind: item.is_actionable ? "task" : "notebook",
            ...(item.is_actionable
              ? { taskId: asConvexItemId(item.id) as Id<"tasks"> }
              : { notebookId: asConvexItemId(item.id) as Id<"notebooks"> }),
            title,
            fireAt: reminder.dueDate,
          });
        } catch (error) {
          console.warn("ensureSoonReminder failed", error);
        }
      }
    },
    [ensureSoonReminder, updateItem],
  );

  const updateTags = useCallback(
    async (item: MindtaskerItem, tags: string[]) => {
      await updateItem(item.id, {
        tags,
        last_interacted_at: new Date().toISOString(),
      });
    },
    [updateItem],
  );

  const togglePriority = useCallback(
    async (item: MindtaskerItem, priority: boolean) => {
      await updateItem(item.id, buildPriorityTogglePatch(item, priority));
    },
    [updateItem],
  );

  const moveToColumn = useCallback(
    async (item: MindtaskerItem, target: DashboardColumn) => {
      const source = getItemColumn(item);
      if (!source || source === target) return;

      const needsTypeFlip =
        (target === "today" && !item.is_actionable) ||
        (target === "notes" && item.is_actionable);

      if (needsTypeFlip) {
        if (!userId) throw new Error("משתמש לא מחובר");
        let nextId: string;
        if (target === "today") {
          const reminder = buildInferredReminderPatch({
            ...item,
            is_actionable: true,
          });
          nextId = await toggleMutation({
            userId,
            itemId: asConvexItemId(item.id),
            dueDate: reminder.due_date,
            metadata: reminder.metadata,
          });
        } else {
          nextId = await toggleMutation({
            userId,
            itemId: asConvexItemId(item.id),
          });
        }
        await updateMutation({
          userId,
          itemId: asConvexItemId(String(nextId)),
          patch: mindtaskerPatchToConvex({
            status: "pending",
            last_interacted_at: new Date().toISOString(),
            metadata: withPinnedBoardColumn(item.metadata, null),
          }),
        });
        return;
      }

      await updateItem(item.id, buildColumnMovePatch(target, item.metadata));
    },
    [toggleMutation, updateItem, updateMutation, userId],
  );

  const placeItem = useCallback(
    async (
      itemId: string,
      targetColumn: DashboardColumn,
      beforeItemId: string | null,
    ) => {
      const item = items.find((entry) => entry.id === itemId);
      if (!item) return;

      const sourceColumn = getItemColumn(item);
      const movedItem =
        sourceColumn === targetColumn ? item : applyColumnPatch(item, targetColumn);

      let targetList = sortColumnItems(
        items
          .map((entry) => (entry.id === itemId ? movedItem : entry))
          .filter((entry) => getItemColumn(entry) === targetColumn),
      ).filter((entry) => entry.id !== itemId);

      const insertAt = beforeItemId
        ? targetList.findIndex((entry) => entry.id === beforeItemId)
        : targetList.length;

      if (insertAt >= 0) {
        targetList.splice(insertAt, 0, movedItem);
      } else {
        targetList.push(movedItem);
      }

      if (sourceColumn === targetColumn) {
        const previous = sortColumnItems(itemsInColumn(items, targetColumn));
        const nextIds = targetList.map((entry) => entry.id);
        const previousIds = previous.map((entry) => entry.id);
        if (nextIds.join("|") === previousIds.join("|")) return;
      }

      const updates = new Map<string, Record<string, unknown>>();
      if (sourceColumn !== targetColumn) {
        const needsTypeFlip =
          (targetColumn === "today" && !item.is_actionable) ||
          (targetColumn === "notes" && item.is_actionable);
        if (needsTypeFlip) {
          await moveToColumn(item, targetColumn);
          return;
        }
        updates.set(itemId, buildColumnMovePatch(targetColumn, item.metadata));
      }

      targetList.forEach((entry, index) => {
        const nextOrder = (index + 1) * 10;
        if ((entry.sort_order ?? 0) !== nextOrder || entry.id === itemId) {
          const existing = updates.get(entry.id) ?? {};
          updates.set(entry.id, { ...existing, sort_order: nextOrder });
        }
      });

      await applyItemPatches(
        [...updates.entries()].map(([id, patch]) => ({ id, patch })),
      );
    },
    [applyItemPatches, items, moveToColumn],
  );

  return {
    loading,
    inbox,
    todayTasks,
    notes,
    inboxArchive,
    notesArchive,
    completedTasks,
    toggleActionable,
    approveInboxItem,
    completeTask,
    snoozeTask,
    clearReminder,
    restoreArchiveItem,
    archiveItem,
    deleteItem,
    restoreDeletedItem,
    restoreCompletedTask,
    editItem,
    updateTags,
    togglePriority,
    moveToColumn,
    placeItem,
    refresh: noopRefresh,
  };
}

export const useItemsConvex = OFFLINE ? useItemsConvexOffline : useItemsConvexOnline;
