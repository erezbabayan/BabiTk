import { useCallback, useEffect, useState } from "react";
import { supabase, type MindtaskerItem } from "../lib/supabase";

export function useTodayTasks() {
  const [items, setItems] = useState<MindtaskerItem[]>([]);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("mindtasker_items")
      .select("id, title, content, is_actionable, status, due_date, tags")
      .eq("is_actionable", true)
      .eq("status", "pending")
      .is("deleted_at", null)
      .order("due_date", { ascending: true, nullsFirst: false });

    setItems((data ?? []) as MindtaskerItem[]);
  }, []);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel("mobile-today")
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
