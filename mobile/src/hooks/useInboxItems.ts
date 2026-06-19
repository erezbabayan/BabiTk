import { useCallback, useEffect, useState } from "react";
import { supabase, normalizeMindtaskerRows, type MindtaskerItem } from "../lib/supabase";

const ITEM_SELECT = `
  id, title, content, is_actionable, status, due_date, tags, source_material_id,
  source_materials (id, source_type, storage_url, raw_text, metadata)
`;

export function useInboxItems() {
  const [items, setItems] = useState<MindtaskerItem[]>([]);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("mindtasker_items")
      .select(ITEM_SELECT)
      .eq("status", "inbox")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    setItems(normalizeMindtaskerRows(data));
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel("mobile-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mindtasker_items" },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const approveItem = useCallback(
    async (item: MindtaskerItem) => {
      await supabase
        .from("mindtasker_items")
        .update({
          status: "pending",
          last_interacted_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      await refresh();
    },
    [refresh],
  );

  const softDeleteItem = useCallback(async (item: MindtaskerItem) => {
    await supabase
      .from("mindtasker_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", item.id);
    await refresh();
  }, [refresh]);

  const restoreItem = useCallback(
    async (item: MindtaskerItem) => {
      await supabase
        .from("mindtasker_items")
        .update({ deleted_at: null })
        .eq("id", item.id);
      await refresh();
    },
    [refresh],
  );

  const snoozeItem = useCallback(
    async (item: MindtaskerItem, dueDate: string) => {
      await supabase
        .from("mindtasker_items")
        .update({
          due_date: dueDate,
          last_interacted_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      await refresh();
    },
    [refresh],
  );

  const updateTags = useCallback(
    async (item: MindtaskerItem, tags: string[]) => {
      await supabase
        .from("mindtasker_items")
        .update({
          tags,
          last_interacted_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      await refresh();
    },
    [refresh],
  );

  return {
    items,
    approveItem,
    softDeleteItem,
    restoreItem,
    snoozeItem,
    updateTags,
    refresh,
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
