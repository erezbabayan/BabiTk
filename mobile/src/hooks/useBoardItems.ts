import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildColumnMovePatch, buildToggleStayMetadata, getItemColumn, itemsInColumn, sortColumnItems, type DashboardColumn } from "../lib/item-columns";
import {
  buildArchivePatch,
  buildSoftDeletePatch,
  resolveRestoreFromArchivePatch,
  resolveRestoreFromTrashPatch,
} from "../lib/item-restore";
import {
  buildClearReminderPatch,
  buildInferredReminderPatch,
  buildManualReminderPatch,
  buildTaskReminderUpdate,
  getReminderFlags,
  type ReminderRecurrence,
} from "../lib/resolve-item-reminder";
import { buildPriorityTogglePatch } from "../lib/item-priority";
import {
  addDemoItem,
  getDemoItemsSnapshot,
  restoreDemoTrashItem,
  updateDemoItem,
} from "../lib/demo-store";
import { isDemoMode, normalizeMindtaskerRows, requireSupabase, type MindtaskerItem } from "../lib/supabase";
import { isSyncEnabled } from "../lib/sync-client";
import {
  applyOptimistic,
  enqueueAction,
  readQueue,
  readCache,
  writeCache,
} from "../offline/store";
import { CACHE_KEYS } from "../offline/types";
import { flushOfflineQueue } from "../offline/sync";
import { useNetworkStatus } from "./useNetworkStatus";
import { ingestText } from "../lib/api";
import { useConvexBackend, useConvexItemsRead, useDemoHybridSync } from "../lib/data-backend";
import { shouldUseConvexAuthLogin } from "../lib/auth-mode";
import type { Id } from "../../../convex/_generated/dataModel";
import { resyncAllItemsToConvex } from "../lib/convex-mirror";
import { useConvexUserId } from "./useConvexUserId";
import { useBoardItemsConvex, type BoardSecondaryLoad } from "./useBoardItemsConvex";

const ITEM_SELECT = `
  id, title, content, is_actionable, status, due_date, tags, source_material_id, sort_order, created_at,
  source_materials (id, source_type, storage_url, raw_text, metadata)
`;

export interface ItemEditInput {
  title: string;
  content: string;
  tags: string[];
  due_date: string | null;
}

async function fetchAllFromServer(): Promise<MindtaskerItem[]> {
  const { data, error } = await requireSupabase()
    .from("mindtasker_items")
    .select(ITEM_SELECT)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return normalizeMindtaskerRows(data);
}

export function useBoardItems(
  userId?: string,
  email?: string,
  secondary?: BoardSecondaryLoad,
) {
  const convexBackend = useConvexBackend();
  const convexItemsRead = useConvexItemsRead();
  const demoHybrid = useDemoHybridSync();
  const useDirectConvexAuth = shouldUseConvexAuthLogin();
  const bridged = useConvexUserId(useDirectConvexAuth ? undefined : userId, email);
  const convexUserId: Id<"users"> | undefined =
    useDirectConvexAuth && userId ? (userId as Id<"users">) : bridged.convexUserId;
  const convexUserResolving = useDirectConvexAuth ? false : bridged.resolving;
  const convex = useBoardItemsConvex(
    convexUserId,
    (convexBackend || demoHybrid) && Boolean(convexUserId),
    secondary,
  );
  const legacy = useBoardItemsLegacy(isDemoMode || !convexBackend, userId);

  if (demoHybrid) {
    const useConvexData = Boolean(convexUserId) && !convex.loading;
    const dataSource = useConvexData ? convex : legacy;
    return {
      loading:
        legacy.loading ||
        (Boolean(userId) && convexUserResolving && !convexUserId) ||
        (Boolean(convexUserId) && convex.loading),
      items: dataSource.items,
      inbox: dataSource.inbox,
      todayTasks: dataSource.todayTasks,
      notes: dataSource.notes,
      inboxArchive: dataSource.inboxArchive,
      notesArchive: dataSource.notesArchive,
      completedTasks: dataSource.completedTasks,
      isOnline: legacy.isOnline,
      isSyncing: legacy.isSyncing,
      syncError: legacy.syncError,
      pendingCount: legacy.pendingCount,
      refresh: async () => {
        await legacy.refresh();
        await resyncAllItemsToConvex(true);
      },
      approveItem: useConvexData ? convex.approveItem : legacy.approveItem,
      completeTask: useConvexData ? convex.completeTask : legacy.completeTask,
      snoozeTask: useConvexData ? convex.snoozeTask : legacy.snoozeTask,
      clearReminder: useConvexData ? convex.clearReminder : legacy.clearReminder,
      archiveItem: useConvexData ? convex.archiveItem : legacy.archiveItem,
      restoreArchiveItem: useConvexData
        ? convex.restoreArchiveItem
        : legacy.restoreArchiveItem,
      restoreCompletedTask: useConvexData
        ? convex.restoreCompletedTask
        : legacy.restoreCompletedTask,
      deleteItem: useConvexData ? convex.deleteItem : legacy.deleteItem,
      restoreDeletedItem: useConvexData
        ? convex.restoreDeletedItem
        : legacy.restoreDeletedItem,
      editItem: useConvexData ? convex.editItem : legacy.editItem,
      toggleActionable: useConvexData
        ? convex.toggleActionable
        : legacy.toggleActionable,
      moveToColumn: useConvexData ? convex.moveToColumn : legacy.moveToColumn,
      placeItem: useConvexData ? convex.placeItem : legacy.placeItem,
      updateTags: useConvexData ? convex.updateTags : legacy.updateTags,
      togglePriority: useConvexData ? convex.togglePriority : legacy.togglePriority,
      addCapturedItem: legacy.addCapturedItem,
      convexUserId,
    };
  }

  if (!convexBackend) {
    return { ...legacy, convexUserId };
  }

  return {
    ...convex,
    convexUserId,
    loading:
      convex.loading ||
      (Boolean(userId) && convexUserResolving && !convexUserId),
  };
}

function useBoardItemsLegacy(enabled: boolean, userId?: string) {
  const [items, setItems] = useState<MindtaskerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const { isOnline, isSyncing, setIsSyncing } = useNetworkStatus();
  const syncVersionRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    try {
      if (isDemoMode) {
        const snapshot = await getDemoItemsSnapshot(syncVersionRef.current);
        syncVersionRef.current = snapshot.version;
        setItems(snapshot.items);
        setSyncError(snapshot.syncOk ? null : snapshot.syncError);
        setLoading(false);
        return;
      }

      const cached = await readCache(CACHE_KEYS.inbox);
      if (cached.length > 0) setItems(cached);

      if (!isOnline) {
        setLoading(false);
        return;
      }

      try {
        const data = await fetchAllFromServer();
        setItems(data);
        await writeCache(CACHE_KEYS.inbox, data);
        setSyncError(null);
      } catch (error) {
        console.warn("Board refresh failed", error);
      } finally {
        setLoading(false);
      }
    } catch (error) {
      if (isDemoMode && isSyncEnabled()) {
        setSyncError(error instanceof Error ? error.message : "סנכרון נכשל");
      }
      setLoading(false);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [enabled, isOnline]);

  const syncQueue = useCallback(async () => {
    if (!enabled || !isOnline || isDemoMode) return;
    setIsSyncing(true);
    try {
      await flushOfflineQueue();
      const queue = await readQueue();
      setPendingCount(queue.length);
      await refresh();
    } finally {
      setIsSyncing(false);
    }
  }, [enabled, isOnline, refresh, setIsSyncing]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    if (isDemoMode) {
      const timer = setInterval(() => void refresh(), 3000);
      return () => clearInterval(timer);
    }
    if (isOnline) void syncQueue();
  }, [enabled, isOnline, refresh, syncQueue]);

  useEffect(() => {
    if (!enabled || !isOnline || isDemoMode) return;
    const supabase = requireSupabase();
    const channel = supabase
      .channel("mobile-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mindtasker_items" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, isOnline, refresh]);

  const patchItem = useCallback(
    async (item: MindtaskerItem, patch: Partial<MindtaskerItem>) => {
      if (!enabled) return;
      if (isDemoMode) {
        const showSync = isSyncEnabled();
        if (showSync) setIsSyncing(true);
        try {
          await updateDemoItem(item.id, patch);
          syncVersionRef.current = null;
          await refresh();
        } catch (error) {
          setSyncError(error instanceof Error ? error.message : "סנכרון נכשל");
          syncVersionRef.current = null;
          await refresh();
        } finally {
          if (showSync) setIsSyncing(false);
        }
        return;
      }

      const supabase = requireSupabase();
      const { error } = await supabase
        .from("mindtasker_items")
        .update(patch)
        .eq("id", item.id);
      if (error) throw error;
      await refresh();
    },
    [enabled, refresh, setIsSyncing],
  );

  const inbox = useMemo(
    () => sortColumnItems(itemsInColumn(items, "inbox")),
    [items],
  );
  const todayTasks = useMemo(
    () => sortColumnItems(itemsInColumn(items, "today")),
    [items],
  );
  const notes = useMemo(
    () => sortColumnItems(itemsInColumn(items, "notes")),
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

  if (!enabled) {
    return {
      loading: false,
      items: [],
      inbox: [],
      todayTasks: [],
      notes: [],
      inboxArchive: [],
      notesArchive: [],
      completedTasks: [],
      isOnline: true,
      isSyncing: false,
      syncError: null,
      pendingCount: 0,
      refresh: async () => {},
      approveItem: async () => {},
      completeTask: async () => {},
      snoozeTask: async () => {},
      clearReminder: async () => {},
      archiveItem: async () => {},
      restoreArchiveItem: async () => {},
      restoreCompletedTask: async () => {},
      deleteItem: async () => {},
      restoreDeletedItem: async () => {},
      editItem: async () => {},
      toggleActionable: async () => {},
      moveToColumn: async () => {},
      placeItem: async () => {},
      updateTags: async () => {},
      togglePriority: async () => {},
      addCapturedItem: async () => {},
    };
  }

  return {
    loading,
    items,
    inbox,
    todayTasks,
    notes,
    inboxArchive,
    notesArchive,
    completedTasks,
    isOnline,
    isSyncing,
    syncError,
    pendingCount,
    refresh,
    approveItem: (item: MindtaskerItem) => {
      const patch: Partial<MindtaskerItem> = {
        status: "pending",
        last_interacted_at: new Date().toISOString(),
      };
      if (item.is_actionable) {
        const reminder = buildInferredReminderPatch(item);
        patch.due_date = reminder.due_date;
        patch.metadata = reminder.metadata;
      }
      return patchItem(item, patch);
    },
    completeTask: (item: MindtaskerItem) =>
      patchItem(item, {
        status: "completed",
        completed_at: new Date().toISOString(),
        last_interacted_at: new Date().toISOString(),
      }),
    snoozeTask: (
      item: MindtaskerItem,
      dueDate: string,
      recurrence?: ReminderRecurrence | null,
    ) => {
      const reminder = buildManualReminderPatch(item, dueDate, recurrence);
      return patchItem(item, {
        ...reminder,
        last_interacted_at: new Date().toISOString(),
      });
    },
    clearReminder: (item: MindtaskerItem) => {
      const reminder = buildClearReminderPatch(item);
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
    deleteItem: async (item: MindtaskerItem) => {
      if (isDemoMode) {
        const showSync = isSyncEnabled();
        if (showSync) setIsSyncing(true);
        try {
          await updateDemoItem(item.id, buildSoftDeletePatch(item));
          syncVersionRef.current = null;
          await refresh();
        } finally {
          if (showSync) setIsSyncing(false);
        }
        return;
      }
      const action = await enqueueAction({ type: "soft_delete", itemId: item.id });
      setItems(applyOptimistic(items, action));
      if (isOnline) await syncQueue();
    },
    restoreDeletedItem: async (item: MindtaskerItem) => {
      if (isDemoMode) {
        const showSync = isSyncEnabled();
        if (showSync) setIsSyncing(true);
        try {
          await restoreDemoTrashItem(item.id);
          syncVersionRef.current = null;
          await refresh();
        } finally {
          if (showSync) setIsSyncing(false);
        }
        return;
      }
      await enqueueAction({ type: "restore", itemId: item.id });
      if (isOnline) await syncQueue();
      await refresh();
    },
    editItem: (item: MindtaskerItem, input: ItemEditInput) => {
      const patch: Partial<MindtaskerItem> = {
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
      return patchItem(item, patch);
    },
    toggleActionable: (item: MindtaskerItem) => {
      const becomesTask = !item.is_actionable;
      const patch: Partial<MindtaskerItem> = {
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
        patch.metadata = {
          ...buildToggleStayMetadata(item),
          ...(reminder.metadata ?? {}),
        };
        delete (patch.metadata as Record<string, unknown>).board_column;
      } else {
        const flags = getReminderFlags(item.metadata);
        if (!flags.manual) {
          patch.due_date = null;
        }
        patch.completed_at = null;
        if (item.status === "completed") {
          patch.status = "pending";
        }
      }
      return patchItem(item, patch);
    },
    moveToColumn: (item: MindtaskerItem, target: DashboardColumn) =>
      patchItem(item, buildColumnMovePatch(target, item.metadata)),
    placeItem: async (itemId: string, targetColumn: DashboardColumn, beforeItemId: string | null) => {
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
        if (fromIndex === toIndex || fromIndex + 1 === toIndex) {
          return;
        }
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
    togglePriority: (item: MindtaskerItem, priority: boolean) =>
      patchItem(item, buildPriorityTogglePatch(item, priority)),
    addCapturedItem: async (item: MindtaskerItem) => {
      if (isDemoMode) {
        const showSync = isSyncEnabled();
        if (showSync) setIsSyncing(true);
        try {
          await addDemoItem(item);
          syncVersionRef.current = null;
          await refresh();
        } catch (error) {
          setSyncError(error instanceof Error ? error.message : "סנכרון נכשל");
          syncVersionRef.current = null;
          await refresh();
          throw error;
        } finally {
          if (showSync) setIsSyncing(false);
        }
        return;
      }

      await ingestText(item.content || item.title, userId);
      await refresh();
    },
  };
}
