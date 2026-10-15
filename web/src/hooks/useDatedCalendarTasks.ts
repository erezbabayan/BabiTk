import { useCallback, useEffect, useState } from "react";

import { getDemoItems } from "../lib/demo-store";
import { isDemoMode, isSupabaseConfigured, requireSupabase } from "../lib/supabase";
import { calendarTasks } from "../lib/task-calendar";
import type { MindtaskerItem } from "../types";

const SELECT =
  "id, user_id, title, content, is_actionable, status, due_date, tags, completed_at, deleted_at, metadata, sort_order, created_at, updated_at, last_interacted_at, source_material_id";

export function useDatedCalendarTasks(userId: string | undefined): {
  items: MindtaskerItem[];
  loading: boolean;
} {
  const [items, setItems] = useState<MindtaskerItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      if (isDemoMode) {
        const demo = await getDemoItems();
        setItems(calendarTasks(demo));
        return;
      }
      if (!isSupabaseConfigured) {
        setItems([]);
        return;
      }
      const { data, error } = await requireSupabase()
        .from("mindtasker_items")
        .select(SELECT)
        .eq("user_id", userId)
        .eq("is_actionable", true)
        .not("due_date", "is", null)
        .is("deleted_at", null)
        .neq("status", "completed")
        .order("due_date", { ascending: true })
        .limit(200);
      if (error) throw error;
      setItems(calendarTasks((data ?? []) as MindtaskerItem[]));
    } catch (error) {
      console.error("dated calendar tasks", error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, loading };
}
