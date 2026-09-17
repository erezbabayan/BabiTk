import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  if (!env.isSupabaseConfigured) {
    throw new Error("ייצוא זמין רק בחשבון ענן");
  }
  const supabase = getSupabaseAdmin();
  const [profile, items, tags, lessons, lists] = await Promise.all([
    supabase.from("users").select("*").eq("id", userId).maybeSingle(),
    supabase.from("mindtasker_items").select("*").eq("user_id", userId),
    supabase.from("user_tags").select("*").eq("user_id", userId),
    supabase.from("user_ingest_lessons").select("*").eq("user_id", userId),
    supabase.from("task_lists").select("*").eq("user_id", userId),
  ]);

  return {
    exported_at: new Date().toISOString(),
    profile: profile.data,
    items: items.data ?? [],
    tags: tags.data ?? [],
    lessons: lessons.data ?? [],
    task_lists: lists.data ?? [],
  };
}

export async function deleteUserAccount(userId: string): Promise<void> {
  if (!env.isSupabaseConfigured) {
    throw new Error("מחיקת חשבון זמינה רק בחשבון ענן");
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(error.message);
  }
}
