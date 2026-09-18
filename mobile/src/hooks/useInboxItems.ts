import { useCallback, useEffect, useState } from "react";
import { supabase, normalizeMindtaskerRows, type MindtaskerItem } from "../lib/supabase";
import { collectPagedRows } from "../lib/supabase-paginate";
import { getSessionUserId, subscribeUserItems } from "../lib/realtime-items";

const ITEM_SELECT = `
  id, title, content, is_actionable, status, due_date, tags, metadata, source_material_id,
  source_materials (id, source_type, storage_url, raw_text, metadata)
`;

export function useInboxItems() {
  const [items, setItems] = useState<MindtaskerItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sessionUserId = userId ?? (await getSessionUserId());
    if (!sessionUserId) {
      setItems([]);
      return;
    }

    const data = await collectPagedRows((from, to) =>
      supabase
        .from("mindtasker_items")
        .select(ITEM_SELECT)
        .eq("user_id", sessionUserId)
        .eq("status", "inbox")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(from, to),
    );

    setItems(normalizeMindtaskerRows(data));
  }, [userId]);

  useEffect(() => {
    void getSessionUserId().then((id) => {
      setUserId(id);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    void refresh();
    return subscribeUserItems(supabase, userId, `mobile-inbox-${userId}`, () => {
      void refresh();
    });
  }, [refresh, userId]);

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
    { label: "בעוד דקה", iso: new Date(now.getTime() + 60_000).toISOString() },
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

export const QUICK_TAGS = ["בית", "עבודה", "לימודים", "קודים", "רעיונות", "פיננסי", "משפחה"];
