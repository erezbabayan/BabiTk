import {
  daysUntilTrashExpiry,
  formatDeletedAt,
  trashCutoffIso,
  type TrashItem,
  TRASH_RETENTION_DAYS,
} from "../lib/trash";
import { getDemoTrashItems, permanentlyDeleteDemoItem, restoreDemoTrashItem } from "../lib/demo-store";
import { isDemoMode, requireSupabase } from "../lib/supabase";
import { resolveRestoreFromTrashPatch } from "../lib/item-restore";

export { TRASH_RETENTION_DAYS, daysUntilTrashExpiry, formatDeletedAt, type TrashItem };

export async function listTrashItems(): Promise<TrashItem[]> {
  if (isDemoMode) {
    return getDemoTrashItems();
  }

  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select("id, title, content, deleted_at, is_actionable, status")
    .not("deleted_at", "is", null)
    .gte("deleted_at", trashCutoffIso())
    .order("deleted_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as TrashItem[];
}

export async function restoreTrashItem(id: string): Promise<void> {
  if (isDemoMode) {
    await restoreDemoTrashItem(id);
    return;
  }

  const supabase = requireSupabase();
  const { data: item, error: fetchError } = await supabase
    .from("mindtasker_items")
    .select("id, status, is_actionable, completed_at, metadata, deleted_at")
    .eq("id", id)
    .single();

  if (fetchError || !item) throw fetchError ?? new Error("Item not found");

  const patch = resolveRestoreFromTrashPatch(item);
  const { error } = await supabase.from("mindtasker_items").update(patch).eq("id", id);

  if (error) throw error;
}

export async function permanentlyDeleteTrashItem(id: string): Promise<void> {
  if (isDemoMode) {
    await permanentlyDeleteDemoItem(id);
    return;
  }

  const supabase = requireSupabase();
  const { error } = await supabase.from("mindtasker_items").delete().eq("id", id);
  if (error) throw error;
}
