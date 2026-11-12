import { isDemoMode, normalizeMindtaskerRows, requireSupabase, type MindtaskerItem } from "./supabase";

const OPEN_ITEM_SELECT = `
  id, title, content, is_actionable, status, due_date, tags, metadata, source_material_id, sort_order, created_at,
  source_materials (id, source_type, storage_url, raw_text, metadata)
`;

/** Load one of the user's items by id (RLS scoped) for the reminder deep link. */
export async function fetchItemForOpen(itemId: string): Promise<MindtaskerItem | null> {
  if (isDemoMode) return null;
  const { data, error } = await requireSupabase()
    .from("mindtasker_items")
    .select(OPEN_ITEM_SELECT)
    .eq("id", itemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return normalizeMindtaskerRows([data])[0] ?? null;
}
