import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import {
  buildColumnMovePatch,
  getItemColumn,
  itemsInColumn,
  sortColumnItems,
  withPinnedBoardColumn,
  type DashboardColumn,
} from "../lib/item-columns";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  asConvexItemId,
  convexItemToMindtasker,
  mindtaskerPatchToConvex,
} from "../lib/convex-items";
import {
  buildArchivePatch,
  buildSoftDeletePatch,
  resolveRestoreFromArchivePatch,
  resolveRestoreFromTrashPatch,
} from "../lib/item-restore";
import type { MindtaskerItem } from "../lib/supabase";
import type { ItemEditInput } from "./useBoardItems";
import {
  buildClearReminderPatch,
  buildInferredReminderPatch,
  buildManualReminderPatch,
  buildTaskReminderUpdate,
  type ReminderRecurrence,
} from "../lib/resolve-item-reminder";
import { buildPriorityTogglePatch } from "../lib/item-priority";
import {
  cancelItemReminderNotification,
  scheduleItemReminderNotification,
} from "../lib/local-notifications";

function reminderKindForItem(item: MindtaskerItem): "task" | "notebook" {
  return item.is_actionable ? "task" : "notebook";
}

async function syncLocalReminder(item: MindtaskerItem, dueDate: string | null | undefined) {
  const kind = reminderKindForItem(item);
  if (!dueDate) {
    await cancelItemReminderNotification(kind, item.id);
    return;
  }
  await scheduleItemReminderNotification({
    kind,
    id: item.id,
    title: item.title,
    dueDateIso: dueDate,
  });
}

export type BoardSecondaryLoad = {
  inboxArchive?: boolean;
  notesArchive?: boolean;
  completed?: boolean;
};

export function useBoardItemsConvex(
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

  const mapRows = useCallback((rows: typeof rawInbox) => (rows ?? []).map(convexItemToMindtasker), []);

  const inbox = useMemo(
    () => sortColumnItems(mapRows(rawInbox)),
    [mapRows, rawInbox],
  );
  const todayTasks = useMemo(
    () => sortColumnItems(mapRows(rawToday)),
    [mapRows, rawToday],
  );
  const notes = useMemo(
    () => sortColumnItems(mapRows(rawNotes)),
    [mapRows, rawNotes],
  );
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

  const patchItem = useCallback(
    async (item: MindtaskerItem, patch: Partial<MindtaskerItem>) => {
      if (!userId) throw new Error("משתמש לא מחובר");
      await updateMutation({
        userId,
        itemId: asConvexItemId(item.id),
        patch: mindtaskerPatchToConvex(patch as Record<string, unknown>),
      });
    },
    [updateMutation, userId],
  );

  return {
    loading,
    items,
    inbox,
    todayTasks,
    notes,
    inboxArchive,
    notesArchive,
    completedTasks,
    isOnline: true,
    isSyncing: false,
    syncError: null,
    pendingCount: 0,
    refresh: async () => {},
    approveItem: async (item: MindtaskerItem) => {
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
        await patchItem(item, patch);
        await syncLocalReminder(item, reminder.due_date ?? null);
        return;
      }
      return patchItem(item, patch);
    },
    completeTask: async (item: MindtaskerItem) => {
      await cancelItemReminderNotification(reminderKindForItem(item), item.id);
      return patchItem(item, {
        status: "completed",
        completed_at: new Date().toISOString(),
        last_interacted_at: new Date().toISOString(),
      });
    },
    snoozeTask: async (
      item: MindtaskerItem,
      dueDate: string,
      recurrence?: ReminderRecurrence | null,
    ) => {
      const reminder = buildManualReminderPatch(item, dueDate, recurrence);
      await patchItem(item, {
        ...reminder,
        last_interacted_at: new Date().toISOString(),
      });
      const fireAt = reminder.due_date ?? dueDate;
      await syncLocalReminder(item, fireAt);
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
    clearReminder: async (item: MindtaskerItem) => {
      const reminder = buildClearReminderPatch(item);
      await cancelItemReminderNotification(reminderKindForItem(item), item.id);
      return patchItem(item, {
        ...reminder,
        last_interacted_at: new Date().toISOString(),
      });
    },
    archiveItem: (item: MindtaskerItem) => patchItem(item, buildArchivePatch(item)),
    restoreArchiveItem: (item: MindtaskerItem) =>
      patchItem(item, resolveRestoreFromArchivePatch(item)),
    restoreCompletedTask: (item: MindtaskerItem) =>
      patchItem(item, {
        status: "pending",
        completed_at: null,
        last_interacted_at: new Date().toISOString(),
      }),
    deleteItem: (item: MindtaskerItem) => patchItem(item, buildSoftDeletePatch(item)),
    restoreDeletedItem: (item: MindtaskerItem) =>
      patchItem(item, resolveRestoreFromTrashPatch(item)),
    editItem: async (item: MindtaskerItem, input: ItemEditInput) => {
      const patch: Record<string, unknown> = {
        title: input.title,
        content: input.content,
        tags: input.tags,
        last_interacted_at: new Date().toISOString(),
      };
      const reminder = buildTaskReminderUpdate(item, {
        title: input.title,
        content: input.content,
        due_date: input.due_date,
      });
      patch.due_date = reminder.dueDate;
      patch.metadata = reminder.metadata;
      await patchItem(item, patch);
      await syncLocalReminder({ ...item, title: input.title }, reminder.dueDate);
    },
    toggleActionable: async (item: MindtaskerItem) => {
      if (!userId) return;
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
    moveToColumn: async (item: MindtaskerItem, target: DashboardColumn) => {
      const source = getItemColumn(item);
      if (!source || source === target) return;
      if (!userId) throw new Error("משתמש לא מחובר");

      const needsTypeFlip =
        (target === "today" && !item.is_actionable) ||
        (target === "notes" && item.is_actionable);

      if (needsTypeFlip) {
        if (!userId) return;
        let nextItemId = asConvexItemId(item.id);
        if (target === "today") {
          const reminder = buildInferredReminderPatch({
            ...item,
            is_actionable: true,
          });
          const createdId = await toggleMutation({
            userId,
            itemId: nextItemId,
            dueDate: reminder.due_date,
            metadata: reminder.metadata,
          });
          if (createdId) nextItemId = String(createdId);
        } else {
          const createdId = await toggleMutation({
            userId,
            itemId: nextItemId,
          });
          if (createdId) nextItemId = String(createdId);
        }

        await updateMutation({
          userId,
          itemId: nextItemId,
          patch: mindtaskerPatchToConvex({
            status: "pending",
            last_interacted_at: new Date().toISOString(),
            metadata: withPinnedBoardColumn(item.metadata, null),
          }),
        });
        return;
      }

      await patchItem(item, buildColumnMovePatch(target, item.metadata));
    },
    placeItem: async (
      itemId: string,
      targetColumn: DashboardColumn,
      beforeItemId: string | null,
    ) => {
      const item = items.find((entry) => entry.id === itemId);
      if (!item) return;

      const sourceColumn = getItemColumn(item);

      if (sourceColumn && sourceColumn !== targetColumn) {
        const needsTypeFlip =
          (targetColumn === "today" && !item.is_actionable) ||
          (targetColumn === "notes" && item.is_actionable);
        if (needsTypeFlip) {
          if (!userId) return;
          let nextItemId = asConvexItemId(item.id);
          if (targetColumn === "today") {
            const reminder = buildInferredReminderPatch({
              ...item,
              is_actionable: true,
            });
            const createdId = await toggleMutation({
              userId,
              itemId: nextItemId,
              dueDate: reminder.due_date,
              metadata: reminder.metadata,
            });
            if (createdId) nextItemId = String(createdId);
          } else {
            const createdId = await toggleMutation({
              userId,
              itemId: nextItemId,
            });
            if (createdId) nextItemId = String(createdId);
          }
          await updateMutation({
            userId,
            itemId: nextItemId,
            patch: mindtaskerPatchToConvex({
              status: "pending",
              last_interacted_at: new Date().toISOString(),
              metadata: withPinnedBoardColumn(item.metadata, null),
            }),
          });
          return;
        }
      }

      const movedItem = item;

      let targetList = sortColumnItems(
        items
          .filter((entry) => getItemColumn(entry) === targetColumn)
          .filter((entry) => entry.id !== itemId),
      );

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
        const fromIndex = previous.findIndex((entry) => entry.id === itemId);
        const toIndex = beforeItemId
          ? previous.findIndex((entry) => entry.id === beforeItemId)
          : previous.length;
        if (fromIndex === toIndex || fromIndex + 1 === toIndex) return;
      }

      const columnPatch =
        sourceColumn !== targetColumn
          ? buildColumnMovePatch(targetColumn, item.metadata)
          : {};

      for (const [index, entry] of targetList.entries()) {
        const nextOrder = (index + 1) * 10;
        const patch: Partial<MindtaskerItem> = { sort_order: nextOrder };
        if (entry.id === itemId) {
          Object.assign(patch, columnPatch);
        }
        if ((entry.sort_order ?? 0) !== nextOrder || entry.id === itemId) {
          await patchItem(entry, patch);
        }
      }
    },
    updateTags: (item: MindtaskerItem, tags: string[]) =>
      patchItem(item, { tags, last_interacted_at: new Date().toISOString() }),
    togglePriority: (item: MindtaskerItem, priority: boolean) =>
      patchItem(item, buildPriorityTogglePatch(item, priority)),
    addCapturedItem: async (_item: MindtaskerItem) => {},
  };
}
