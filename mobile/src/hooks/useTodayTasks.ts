import { useCallback, useEffect, useState } from "react";
import { supabase, type MindtaskerItem } from "../lib/supabase";
import { getSessionUserId, subscribeUserItems } from "../lib/realtime-items";

export function useTodayTasks() {
  const [items, setItems] = useState<MindtaskerItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const sessionUserId = userId ?? (await getSessionUserId());
    if (!sessionUserId) {
      setItems([]);
      return;
    }

    const { data } = await supabase
      .from("mindtasker_items")
      .select("id, title, content, is_actionable, status, due_date, tags")
      .eq("user_id", sessionUserId)
      .eq("is_actionable", true)
      .eq("status", "pending")
      .is("deleted_at", null)
      .order("due_date", { ascending: true, nullsFirst: false });

    setItems((data ?? []) as MindtaskerItem[]);
  }, [userId]);

  useEffect(() => {
    void getSessionUserId().then((id) => {
      setUserId(id);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    void refresh();
    return subscribeUserItems(supabase, userId, `mobile-today-${userId}`, () => {
      void refresh();
    });
  }, [refresh, userId]);

  const completeTask = useCallback(
    async (item: MindtaskerItem) => {
      await supabase
        .from("mindtasker_items")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          last_interacted_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      await refresh();
    },
    [refresh],
  );

  return { items, completeTask, refresh };
}
