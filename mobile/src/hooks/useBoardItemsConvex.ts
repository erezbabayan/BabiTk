import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import {
  buildColumnMovePatch,
  getItemColumn,
  itemsInColumn,
  sortColumnItems,
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
} from "../lib/item-restore";
import type { MindtaskerItem } from "../lib/supabase";
import type { ItemEditInput } from "./useBoardItems";

export function useBoardItemsConvex(userId: Id<"users"> | undefined, enabled: boolean) {
  const rawItems = useQuery(
    api.items.listActive,
    enabled && userId ? { userId } : "skip",
  );
  const updateMutation = useMutation(api.items.update);
  const toggleMutation = useMutation(api.items.toggleActionable);

  const items = useMemo(
    () => (rawItems ?? []).map(convexItemToMindtasker),
    [rawItems],
  );
  const loading = enabled && userId ? rawItems === undefined : false;

  const patchItem = useCallback(
    async (item: MindtaskerItem, patch: Partial<MindtaskerItem>) => {
      if (!userId) return;
      await updateMutation({
        userId,
        itemId: asConvexItemId(item.id),
        patch: mindtaskerPatchToConvex(patch as Record<string, unknown>),
      });
    },
    [updateMutation, userId],
  );

  const inbox = useMemo(
    () => sortColumnItems(items.filter((i) => i.status === "inbox")),
    [items],
  );
  const todayTasks = useMemo(
    () => sortColumnItems(items.filter((i) => i.is_actionable && i.status === "pending")),
    [items],
  );
  const notes = useMemo(
    () => sortColumnItems(items.filter((i) => !i.is_actionable && i.status === "pending")),
    [items],
  );
  const inboxArchive = useMemo(
    () => items.filter((i) => i.status === "snoozed_archive" && i.is_actionable),
    [items],
  );
  const notesArchive = useMemo(
    () => items.filter((i) => i.status === "snoozed_archive" && !i.is_actionable),
    [items],
  );
  const completedTasks = useMemo(
    () => items.filter((i) => i.status === "completed" && i.is_actionable),
    [items],
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
    approveItem: (item: MindtaskerItem) =>
      patchItem(item, { status: "pending", last_interacted_at: new Date().toISOString() }),
    completeTask: (item: MindtaskerItem) =>
      patchItem(item, {
        status: "completed",
        completed_at: new Date().toISOString(),
        last_interacted_at: new Date().toISOString(),
      }),
    snoozeTask: (item: MindtaskerItem, dueDate: string) =>
      patchItem(item, { due_date: dueDate, last_interacted_at: new Date().toISOString() }),
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
    restoreDeletedItem: async (_item: MindtaskerItem) => {},
    editItem: (item: MindtaskerItem, input: ItemEditInput) =>
      patchItem(item, {
        title: input.title,
        content: input.content,
        tags: input.tags,
        due_date: item.is_actionable ? input.due_date : null,
        last_interacted_at: new Date().toISOString(),
      }),
    toggleActionable: async (item: MindtaskerItem) => {
      if (!userId) return;
      const becomesTask = !item.is_actionable;
      await toggleMutation({
        userId,
        itemId: asConvexItemId(item.id),
        dueDate: becomesTask ? (item.due_date ?? null) : undefined,
      });
    },
    moveToColumn: (item: MindtaskerItem, target: DashboardColumn) =>
      patchItem(item, buildColumnMovePatch(target)),
    placeItem: async (
      itemId: string,
      targetColumn: DashboardColumn,
      beforeItemId: string | null,
    ) => {
      const item = items.find((entry) => entry.id === itemId);
      if (!item) return;

      const sourceColumn = getItemColumn(item);
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
        sourceColumn !== targetColumn ? buildColumnMovePatch(targetColumn) : {};

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
    addCapturedItem: async (_item: MindtaskerItem) => {},
  };
}
