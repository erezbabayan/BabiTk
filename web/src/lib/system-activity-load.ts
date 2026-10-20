import type { MindtaskerItem } from "../types";
import { getDemoActivityItems } from "./demo-store";
import { isDemoMode, isSupabaseConfigured, requireSupabase } from "./supabase";
import { collectPagedRows } from "./supabase-paginate";

const ACTIVITY_ITEM_SELECT = `
  id, user_id, title, content, is_actionable, status, due_date, tags,
  source_material_id, sort_order, created_at, updated_at, last_interacted_at,
  completed_at, calendar_event_id, deleted_at, metadata,
  source_materials (id, source_type, storage_url, raw_text, metadata)
`;

export async function loadSystemActivityItems(userId: string): Promise<MindtaskerItem[]> {
  if (!userId) return [];
  if (isDemoMode) {
    return getDemoActivityItems();
  }
  if (!isSupabaseConfigured) return [];
  const supabase = requireSupabase();
  const data = await collectPagedRows((from, to) =>
    supabase
      .from("mindtasker_items")
      .select(ACTIVITY_ITEM_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to),
  );
  return data as unknown as MindtaskerItem[];
}
