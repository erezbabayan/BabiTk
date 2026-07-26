import { supabase, normalizeMindtaskerRows, isSupabaseConfigured, type MindtaskerItem } from "../lib/supabase";
import { apiFetch } from "../lib/api";
import { buildSoftDeletePatch, resolveRestoreFromTrashPatch } from "../lib/item-restore";
import type { OfflineAction } from "./types";
import { readQueue, writeQueue } from "./store";

async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function executeAction(action: OfflineAction): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");

  switch (action.type) {
    case "approve": {
      const res = await apiFetch(`/api/items/${action.itemId}/approve`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error(`Approve failed: ${res.status}`);
      return;
    }
    case "complete": {
      const res = await apiFetch(`/api/items/${action.itemId}/complete`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error(`Complete failed: ${res.status}`);
      return;
    }
    case "soft_delete": {
      const { data: item, error: fetchError } = await supabase
        .from("mindtasker_items")
        .select("status, completed_at, metadata, deleted_at")
        .eq("id", action.itemId)
        .single();
      if (fetchError) throw fetchError;
      const patch = buildSoftDeletePatch(item as MindtaskerItem);
      const { error } = await supabase
        .from("mindtasker_items")
        .update(patch)
        .eq("id", action.itemId);
      if (error) throw error;
      return;
    }
    case "restore": {
      const { data: item, error: fetchError } = await supabase
        .from("mindtasker_items")
        .select("status, is_actionable, completed_at, metadata, deleted_at")
        .eq("id", action.itemId)
        .single();
      if (fetchError) throw fetchError;
      const patch = resolveRestoreFromTrashPatch(item as MindtaskerItem);
      const { error } = await supabase
        .from("mindtasker_items")
        .update(patch)
        .eq("id", action.itemId);
      if (error) throw error;
      return;
    }
    case "snooze": {
      const dueDate = action.payload?.dueDate as string;
      const res = await apiFetch(`/api/items/${action.itemId}/snooze`, {
        method: "PATCH",
        body: JSON.stringify({ due_date: dueDate }),
      });
      if (!res.ok) throw new Error(`Snooze failed: ${res.status}`);
      return;
    }
    case "update_tags": {
      const { error } = await supabase
        .from("mindtasker_items")
        .update({
          tags: action.payload?.tags as string[],
          last_interacted_at: new Date().toISOString(),
        })
        .eq("id", action.itemId);
      if (error) throw error;
      return;
    }
    default:
      return;
  }
}

export async function flushOfflineQueue(): Promise<{ synced: number; failed: number }> {
  const queue = await readQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  const remaining: OfflineAction[] = [];
  let synced = 0;
  let lastError: string | null = null;

  for (const action of queue) {
    try {
      await executeAction(action);
      synced++;
    } catch (error) {
      remaining.push(action);
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  await writeQueue(remaining);
  if (lastError && remaining.length > 0) {
    console.warn(
      `[offline-sync] ${remaining.length} action(s) still pending: ${lastError}`,
    );
  }
  return { synced, failed: remaining.length };
}

export async function fetchInboxFromServer(): Promise<MindtaskerItem[]> {
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select(
      `id, title, content, is_actionable, status, due_date, tags, source_material_id,
       source_materials (id, source_type, storage_url, raw_text, metadata)`,
    )
    .eq("status", "inbox")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return normalizeMindtaskerRows(data);
}

export async function fetchTodayFromServer(): Promise<MindtaskerItem[]> {
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select("id, title, content, is_actionable, status, due_date, tags")
    .eq("is_actionable", true)
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return normalizeMindtaskerRows(data);
}

export async function fetchNotesFromServer(): Promise<MindtaskerItem[]> {
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select(
      `id, title, content, is_actionable, status, due_date, tags, source_material_id,
       source_materials (id, source_type, storage_url, raw_text, metadata)`,
    )
    .eq("is_actionable", false)
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return normalizeMindtaskerRows(data);
}
