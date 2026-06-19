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
  type DashboardColumn,
} from "../lib/item-columns";
import {
  buildArchivePatch,
  buildSoftDeletePatch,
  resolveRestoreFromArchivePatch,
} from "../lib/item-restore";
import type { ItemEditInput } from "../components/ItemEditModal";
import type { MindtaskerItem } from "../types";

const noopRefresh = async () => {};

export function useItemsConvex(userId: Id<"users"> | undefined, enabled: boolean) {
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

  const updateItem = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      if (!userId) return;
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
      if (!userId) return;
      const becomesTask = !item.is_actionable;
      if (becomesTask) {
        await toggleMutation({
          userId,
          itemId: asConvexItemId(item.id),
          dueDate: item.due_date ?? null,
        });
      } else {
        await toggleMutation({
          userId,
          itemId: asConvexItemId(item.id),
        });
      }
    },
    [toggleMutation, userId],
  );

  const approveInboxItem = useCallback(
    async (item: MindtaskerItem) => {
      await updateItem(item.id, {
        status: "pending",
        last_interacted_at: new Date().toISOString(),
      });
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
    async (item: MindtaskerItem, dueDate: string) => {
      await updateItem(item.id, {
        due_date: dueDate,
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
      if (item.is_actionable) {
        patch.due_date = input.due_date ?? null;
      }
      await updateItem(item.id, patch);
    },
    [updateItem],
  );

  const moveToColumn = useCallback(
    async (item: MindtaskerItem, target: DashboardColumn) => {
      const source = getItemColumn(item);
      if (!source || source === target) return;
      await updateItem(item.id, buildColumnMovePatch(target));
    },
    [updateItem],
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
        updates.set(itemId, buildColumnMovePatch(targetColumn));
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
    [applyItemPatches, items],
  );

  const inbox = sortColumnItems(items.filter((item) => item.status === "inbox"));
  const todayTasks = sortColumnItems(
    items.filter((item) => item.is_actionable && item.status === "pending"),
  );
  const notes = sortColumnItems(
    items.filter((item) => !item.is_actionable && item.status === "pending"),
  );
  const inboxArchive = items.filter(
    (item) => item.status === "snoozed_archive" && item.is_actionable,
  );
  const notesArchive = items.filter(
    (item) => item.status === "snoozed_archive" && !item.is_actionable,
  );
  const completedTasks = items.filter(
    (item) => item.is_actionable && item.status === "completed",
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
    restoreArchiveItem,
    archiveItem,
    deleteItem,
    restoreCompletedTask,
    editItem,
    moveToColumn,
    placeItem,
    refresh: noopRefresh,
  };
}
