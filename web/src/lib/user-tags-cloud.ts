import {
  MAX_USER_TAGS,
  defaultUserTagsPayload,
  mergeMissingDefaultTags,
  normalizeTagName,
  type UserTag,
} from "./tags";
import { requireSupabase } from "./supabase";

async function requireUserId(): Promise<string> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not authenticated");
  return data.user.id;
}

function mapRows(
  rows: Array<{ id: string; name: string; color: string; sort_order: number }>,
): UserTag[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    sort_order: row.sort_order,
  }));
}

export async function listUserTagsFromSupabase(): Promise<UserTag[]> {
  const supabase = requireSupabase();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("user_tags")
    .select("id, name, color, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  const rows = mapRows(data ?? []);
  if (rows.length > 0) return rows;

  const seeded = mergeMissingDefaultTags(defaultUserTagsPayload());
  return saveUserTagsToSupabase(seeded);
}

export async function saveUserTagsToSupabase(
  tags: { name: string; color: string }[],
): Promise<UserTag[]> {
  const supabase = requireSupabase();
  const userId = await requireUserId();
  const cleaned = tags
    .map((tag) => ({
      name: normalizeTagName(tag.name),
      color: tag.color,
    }))
    .filter((tag) => tag.name.length > 0)
    .slice(0, MAX_USER_TAGS);

  if (cleaned.length === 0) {
    throw new Error("נדרשת לפחות תגית אחת");
  }

  const { error: deleteError } = await supabase.from("user_tags").delete().eq("user_id", userId);
  if (deleteError) throw deleteError;

  const { data, error } = await supabase
    .from("user_tags")
    .insert(
      cleaned.map((tag, index) => ({
        user_id: userId,
        name: tag.name,
        color: tag.color,
        sort_order: index,
      })),
    )
    .select("id, name, color, sort_order")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return mapRows(data ?? []);
}
