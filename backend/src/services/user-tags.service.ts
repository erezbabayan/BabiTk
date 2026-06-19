import { DEFAULT_USER_TAGS } from "../constants/default-tags.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

export interface UserTag {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export async function listUserTags(userId: string): Promise<UserTag[]> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("user_tags")
    .select("id, name, color, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to list user tags: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return ensureDefaultTags(userId);
  }

  return data as UserTag[];
}

export async function ensureDefaultTags(userId: string): Promise<UserTag[]> {
  const supabase = getSupabaseAdmin();

  const { data: existing, error: readError } = await supabase
    .from("user_tags")
    .select("id, name, color, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (readError) {
    throw new Error(`Failed to read user tags: ${readError.message}`);
  }

  if (existing && existing.length > 0) {
    return existing as UserTag[];
  }

  const rows = DEFAULT_USER_TAGS.map((tag, index) => ({
    user_id: userId,
    name: tag.name,
    color: tag.color,
    sort_order: index,
  }));

  const { error: insertError } = await supabase.from("user_tags").insert(rows);

  if (insertError) {
    throw new Error(`Failed to seed default tags: ${insertError.message}`);
  }

  return listUserTags(userId);
}

export async function getUserTagNames(userId: string): Promise<string[]> {
  const tags = await listUserTags(userId);
  return tags.map((tag) => tag.name);
}

export async function replaceUserTags(
  userId: string,
  tags: { name: string; color: string }[],
): Promise<UserTag[]> {
  const supabase = getSupabaseAdmin();
  const cleaned = tags
    .map((tag, index) => ({
      name: tag.name.trim(),
      color: tag.color.trim() || "#64748b",
      sort_order: index,
    }))
    .filter((tag) => tag.name.length > 0);

  if (cleaned.length === 0) {
    throw new Error("At least one tag is required");
  }

  const names = cleaned.map((tag) => tag.name);
  if (new Set(names).size !== names.length) {
    throw new Error("Duplicate tag names are not allowed");
  }

  const { error: deleteError } = await supabase
    .from("user_tags")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    throw new Error(`Failed to clear user tags: ${deleteError.message}`);
  }

  const { data, error } = await supabase
    .from("user_tags")
    .insert(
      cleaned.map((tag) => ({
        user_id: userId,
        name: tag.name,
        color: tag.color,
        sort_order: tag.sort_order,
      })),
    )
    .select("id, name, color, sort_order");

  if (error) {
    throw new Error(`Failed to save user tags: ${error.message}`);
  }

  return (data ?? []) as UserTag[];
}
