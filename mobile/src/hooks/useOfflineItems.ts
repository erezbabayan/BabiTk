import { useCallback, useEffect, useState } from "react";
import {
  applyOptimistic,
  enqueueAction,
  readCache,
  readQueue,
  writeCache,
} from "../offline/store";
import { CACHE_KEYS } from "../offline/types";
import {
  fetchInboxFromServer,
  fetchNotesFromServer,
  fetchTodayFromServer,
  flushOfflineQueue,
} from "../offline/sync";
import type { MindtaskerItem } from "../lib/supabase";
import { isDemoMode, requireSupabase } from "../lib/supabase";
import { getDemoItems, updateDemoItem, removeDemoItem } from "../lib/demo-store";
import { useNetworkStatus } from "./useNetworkStatus";

type ListKind = "inbox" | "today" | "notes";

function filterByKind(items: MindtaskerItem[], kind: ListKind): MindtaskerItem[] {
  switch (kind) {
    case "inbox":
      return items.filter((item) => item.status === "inbox");
    case "today":
      return items.filter((item) => item.is_actionable && item.status === "pending");
    case "notes":
      return items.filter((item) => !item.is_actionable && item.status === "pending");
  }
}

function cacheKeyForKind(kind: ListKind): string {
  switch (kind) {
    case "inbox":
      return CACHE_KEYS.inbox;
    case "today":
      return CACHE_KEYS.today;
    case "notes":
      return CACHE_KEYS.notes;
  }
}

export function useOfflineItems(kind: ListKind) {
  const cacheKey = cacheKeyForKind(kind);
  const [items, setItems] = useState<MindtaskerItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const { isOnline, isSyncing, setIsSyncing } = useNetworkStatus();

  const refreshFromServer = useCallback(async () => {
    if (isDemoMode) {
      const all = await getDemoItems();
      const filtered = filterByKind(all, kind);
      setItems(filtered);
      await writeCache(cacheKey, filtered);
      return;
    }

    const cached = await readCache(cacheKey);
    if (cached.length > 0) setItems(cached);

    if (!isOnline) return;

    try {
      const data =
        kind === "inbox"
          ? await fetchInboxFromServer()
          : kind === "today"
            ? await fetchTodayFromServer()
            : await fetchNotesFromServer();
      setItems(data);
      await writeCache(cacheKey, data);
    } catch (error) {
      console.warn("Failed to refresh from server, using cache", error);
    }
  }, [cacheKey, isOnline, kind]);

  const syncQueue = useCallback(async () => {
    if (!isOnline) return;
    setIsSyncing(true);
    try {
      await flushOfflineQueue();
      const queue = await readQueue();
      setPendingCount(queue.length);
      await refreshFromServer();
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, refreshFromServer, setIsSyncing]);

  useEffect(() => {
    void refreshFromServer();
  }, [refreshFromServer]);

  useEffect(() => {
    if (isOnline) void syncQueue();
  }, [isOnline, syncQueue]);

  useEffect(() => {
    if (!isDemoMode) return;
    const timer = setInterval(() => void refreshFromServer(), 8000);
    return () => clearInterval(timer);
  }, [refreshFromServer]);

  useEffect(() => {
    if (!isOnline || isDemoMode) return;

    const supabase = requireSupabase();
    const channel = supabase
      .channel(`mobile-offline-${kind}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mindtasker_items" },
        () => void refreshFromServer(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isOnline, kind, refreshFromServer]);

  const mutate = useCallback(
    async (
      type: Parameters<typeof enqueueAction>[0]["type"],
      item: MindtaskerItem,
      payload?: Record<string, unknown>,
    ) => {
      if (isDemoMode) {
        if (type === "approve") {
          await updateDemoItem(item.id, { status: "pending" });
        } else if (type === "complete") {
          await updateDemoItem(item.id, { status: "completed" });
        } else if (type === "soft_delete") {
          await removeDemoItem(item.id);
          await refreshFromServer();
          return;
        } else if (type === "restore") {
          await updateDemoItem(item.id, { status: "inbox" });
        } else if (type === "snooze") {
          await updateDemoItem(item.id, { due_date: String(payload?.dueDate ?? null) });
        } else if (type === "update_tags") {
          await updateDemoItem(item.id, { tags: (payload?.tags as string[]) ?? item.tags });
        }
        await refreshFromServer();
        return;
      }

      const action = await enqueueAction({ type, itemId: item.id, payload });
      const optimistic = applyOptimistic(items, action);
      setItems(optimistic);
      await writeCache(cacheKey, optimistic);
      const queue = await readQueue();
      setPendingCount(queue.length);

      if (isOnline) {
        await syncQueue();
      }
    },
    [items, cacheKey, isOnline, syncQueue, kind, refreshFromServer],
  );

  return {
    items,
    isOnline,
    isSyncing,
    pendingCount,
    refresh: refreshFromServer,
    syncQueue,
    approveItem: (item: MindtaskerItem) => mutate("approve", item),
    completeTask: (item: MindtaskerItem) => mutate("complete", item),
    softDeleteItem: (item: MindtaskerItem) => mutate("soft_delete", item),
    restoreItem: async (item: MindtaskerItem) => mutate("restore", item),
    snoozeItem: (item: MindtaskerItem, dueDate: string) =>
      mutate("snooze", item, { dueDate }),
    updateTags: (item: MindtaskerItem, tags: string[]) =>
      mutate("update_tags", item, { tags }),
  };
}

export function snoozePresets() {
  const now = new Date();
  return [
    { label: "עוד 3 שעות", iso: new Date(now.getTime() + 3 * 3600000).toISOString() },
    {
      label: "מחר בבוקר",
      iso: (() => {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d.toISOString();
      })(),
    },
    {
      label: "שבוע הבא",
      iso: (() => {
        const d = new Date(now);
        d.setDate(d.getDate() + 7);
        d.setHours(9, 0, 0, 0);
        return d.toISOString();
      })(),
    },
  ];
}

export const QUICK_TAGS = ["בית", "עבודה", "קודים", "רעיונות", "פיננסי", "משפחה"];
