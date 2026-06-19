import { useCallback, useEffect, useRef, useState } from "react";

import { toggleItemTypeApi, approveItemApi, completeItemApi, snoozeItemApi, restoreArchiveItemApi } from "../lib/api";
import {
  buildArchivePatch,
  buildSoftDeletePatch,
  resolveRestoreFromArchivePatch,
} from "../lib/item-restore";

import type { ItemEditInput } from "../components/ItemEditModal";

import {
  applyColumnPatch,
  buildColumnMovePatch,
  getItemColumn,
  itemsInColumn,
  sortColumnItems,
  type DashboardColumn,
} from "../lib/item-columns";

import {

  getDemoItems,

  getDemoItemsSnapshot,

  updateDemoItem,

} from "../lib/demo-store";

import { isDemoMode } from "../lib/supabase";

import { requireSupabase } from "../lib/supabase";

import { useConvexBackend } from "../lib/data-backend";

import { useConvexUserId } from "./useConvexUserId";
import { useItemsConvex } from "./useItemsConvex";

import type { MindtaskerItem } from "../types";



const ITEM_SELECT = `

  *,

  source_materials (

    id,

    source_type,

    storage_url,

    raw_text,

    metadata

  )

`;



const DEMO_POLL_MS = 8000;

export function useItems(userId: string | undefined, email?: string) {
  const convexBackend = useConvexBackend();
  const convexUserId = useConvexUserId(userId, email);
  const convex = useItemsConvex(convexUserId, convexBackend);
  const supabase = useItemsSupabase(userId, !convexBackend);
  return convexBackend ? convex : supabase;
}

function useItemsSupabase(userId: string | undefined, enabled: boolean) {

  const [items, setItems] = useState<MindtaskerItem[]>([]);

  const [loading, setLoading] = useState(true);

  const syncVersionRef = useRef<number | null>(null);

  const refreshInFlightRef = useRef(false);



  const refresh = useCallback(async () => {

    if (!enabled) {

      setLoading(false);

      return;

    }

    if (!userId) {

      setItems([]);

      setLoading(false);

      return;

    }

    if (refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;



    try {

    if (isDemoMode) {
      const snapshot = await getDemoItemsSnapshot(syncVersionRef.current);
      syncVersionRef.current = snapshot.version;
      setItems((prev) =>
        snapshot.changed || prev.length === 0 ? snapshot.items : prev,
      );
      setLoading(false);
      return;
    }



    const supabase = requireSupabase();

    const { data, error } = await supabase

      .from("mindtasker_items")

      .select(ITEM_SELECT)

      .is("deleted_at", null)

      .order("sort_order", { ascending: true })

      .order("created_at", { ascending: false });



    if (error) {

      console.error(error);

      setLoading(false);

      return;

    }



    setItems((data ?? []) as MindtaskerItem[]);

    setLoading(false);

    } finally {

      refreshInFlightRef.current = false;

    }

  }, [enabled, userId]);



  useEffect(() => {

    if (!enabled) {

      setLoading(false);

      return;

    }

    void refresh();

  }, [enabled, refresh]);



  useEffect(() => {

    if (!enabled || !userId || isDemoMode) return;



    const supabase = requireSupabase();

    const channel = supabase

      .channel("mindtasker-items")

      .on(

        "postgres_changes",

        { event: "*", schema: "public", table: "mindtasker_items" },

        () => void refresh(),

      )

      .subscribe();



    return () => {

      void supabase.removeChannel(channel);

    };

  }, [enabled, userId, refresh]);



  useEffect(() => {
    if (!enabled || !userId || !isDemoMode) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refresh();
    };

    const start = () => {
      if (timer) return;
      timer = setInterval(tick, DEMO_POLL_MS);
    };

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        tick();
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, userId, refresh]);



  const updateItem = useCallback(

    async (id: string, patch: Record<string, unknown>) => {

      if (!enabled) return;

      if (isDemoMode) {

        await updateDemoItem(id, patch as Partial<MindtaskerItem>);

        await refresh();

        return;

      }



      const supabase = requireSupabase();

      const { error } = await supabase.from("mindtasker_items").update(patch).eq("id", id);

      if (error) throw error;

      await refresh();

    },

    [enabled, refresh],

  );



  const applyItemPatches = useCallback(

    async (updates: { id: string; patch: Record<string, unknown> }[]) => {

      if (!enabled || updates.length === 0) return;

      const merged = new Map<string, Record<string, unknown>>();
      for (const { id, patch } of updates) {
        merged.set(id, { ...(merged.get(id) ?? {}), ...patch });
      }
      const normalized = [...merged.entries()].map(([id, patch]) => ({ id, patch }));

      setItems((prev) =>
        prev.map((item) => {
          const patch = merged.get(item.id);
          return patch ? ({ ...item, ...patch } as MindtaskerItem) : item;
        }),
      );

      if (isDemoMode) {

        for (const { id, patch } of normalized) {

          await updateDemoItem(id, patch as Partial<MindtaskerItem>);

        }

        return;

      }



      const supabase = requireSupabase();

      for (const { id, patch } of normalized) {

        const { error } = await supabase.from("mindtasker_items").update(patch).eq("id", id);

        if (error) throw error;

      }

      await refresh();

    },

    [enabled, refresh],

  );



  const toggleActionable = useCallback(

    async (item: MindtaskerItem) => {

      if (!enabled) return;

      const becomesTask = !item.is_actionable;

      if (isDemoMode) {

        const patch: Partial<MindtaskerItem> = {

          is_actionable: becomesTask,

          last_interacted_at: new Date().toISOString(),

        };

        if (becomesTask) {

          patch.due_date = item.due_date ?? null;

        } else {

          patch.due_date = null;

          patch.completed_at = null;

        }

        await updateDemoItem(item.id, patch);

        await refresh();

        return;

      }



      await toggleItemTypeApi(item.id, becomesTask ? item.due_date : null);

      await refresh();

    },

    [enabled, refresh],

  );



  const approveInboxItem = useCallback(

    async (item: MindtaskerItem) => {

      if (!enabled) return;

      if (isDemoMode) {

        await updateDemoItem(item.id, {

          status: "pending",

          last_interacted_at: new Date().toISOString(),

        });

        await refresh();

        return;

      }



      await approveItemApi(item.id);

      await refresh();

    },

    [enabled, refresh],

  );



  const completeTask = useCallback(

    async (item: MindtaskerItem) => {

      if (!enabled) return;

      if (isDemoMode) {

        await updateItem(item.id, {

          status: "completed",

          completed_at: new Date().toISOString(),

          last_interacted_at: new Date().toISOString(),

        });

        return;

      }



      await completeItemApi(item.id);

      await refresh();

    },

    [enabled, updateItem, refresh],

  );



  const snoozeTask = useCallback(

    async (item: MindtaskerItem, dueDate: string) => {

      if (!enabled) return;

      if (isDemoMode) {

        await updateItem(item.id, {

          due_date: dueDate,

          last_interacted_at: new Date().toISOString(),

        });

        return;

      }



      await snoozeItemApi(item.id, dueDate);

      await refresh();

    },

    [enabled, updateItem, refresh],

  );



  const restoreArchiveItem = useCallback(

    async (item: MindtaskerItem) => {

      if (!enabled) return;

      if (isDemoMode) {

        await updateItem(item.id, resolveRestoreFromArchivePatch(item));

        return;

      }



      await restoreArchiveItemApi(item.id);

      await refresh();

    },

    [updateItem, refresh],

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

      if (!title) {

        throw new Error("כותרת חובה");

      }



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

        if (nextIds.join("|") === previousIds.join("|")) {

          return;

        }

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

    [items, applyItemPatches],

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



  if (!enabled) {

    return {

      loading: false,

      inbox: [],

      todayTasks: [],

      notes: [],

      inboxArchive: [],

      notesArchive: [],

      completedTasks: [],

      toggleActionable: async () => {},

      approveInboxItem: async () => {},

      completeTask: async () => {},

      snoozeTask: async () => {},

      restoreArchiveItem: async () => {},

      archiveItem: async () => {},

      deleteItem: async () => {},

      restoreCompletedTask: async () => {},

      editItem: async () => {},

      moveToColumn: async () => {},

      placeItem: async () => {},

      refresh: async () => {},

    };

  }



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

    refresh,

  };

}



export function snoozePresets() {

  const now = new Date();

  return {

    in3Hours: new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString(),

    tomorrowMorning: (() => {

      const d = new Date(now);

      d.setDate(d.getDate() + 1);

      d.setHours(9, 0, 0, 0);

      return d.toISOString();

    })(),

    nextWeek: (() => {

      const d = new Date(now);

      d.setDate(d.getDate() + 7);

      d.setHours(9, 0, 0, 0);

      return d.toISOString();

    })(),

  };

}


