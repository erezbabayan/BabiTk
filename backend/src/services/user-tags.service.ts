import { DEFAULT_USER_TAGS } from "../constants/default-tags.js";
import { computeTagDefinitionDiff } from "../lib/tag-definition-diff.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { cascadeTagsToSupabaseItems } from "./tag-cascade.service.js";

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

  return ensureDefaultTags(userId, (data as UserTag[] | null) ?? []);
}

export async function ensureDefaultTags(
  userId: string,
  existingRows?: UserTag[],
): Promise<UserTag[]> {
  const supabase = getSupabaseAdmin();

  let existing = existingRows;
  if (!existing) {
    const { data, error: readError } = await supabase
      .from("user_tags")
      .select("id, name, color, sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (readError) {
      throw new Error(`Failed to read user tags: ${readError.message}`);
    }
    existing = (data as UserTag[] | null) ?? [];
  }

  if (existing.length === 0) {
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

    const { data, error } = await supabase
      .from("user_tags")
      .select("id, name, color, sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(`Failed to list user tags: ${error.message}`);
    return (data as UserTag[]) ?? [];
  }

  // Backfill newly added system defaults without wiping custom tags.
  const existingNames = new Set(existing.map((tag) => tag.name));
  let maxSort = existing.reduce((max, tag) => Math.max(max, tag.sort_order), -1);
  const toInsert: Array<{
    user_id: string;
    name: string;
    color: string;
    sort_order: number;
  }> = [];

  for (const tag of DEFAULT_USER_TAGS) {
    if (existingNames.has(tag.name)) continue;
    maxSort += 1;
    toInsert.push({
      user_id: userId,
      name: tag.name,
      color: tag.color,
      sort_order: maxSort,
    });
  }

  if (toInsert.length === 0) {
    return existing;
  }

  const { error: insertError } = await supabase.from("user_tags").insert(toInsert);
  if (insertError) {
    throw new Error(`Failed to backfill default tags: ${insertError.message}`);
  }

  const { data, error } = await supabase
    .from("user_tags")
    .select("id, name, color, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`Failed to list user tags: ${error.message}`);
  return (data as UserTag[]) ?? [];
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
      name: tag.name.trim().replace(/^#+/, ""),
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

  const previousTags = await listUserTags(userId);
  const diff = computeTagDefinitionDiff(
    previousTags.map((tag) => ({ name: tag.name })),
    cleaned.map((tag) => ({ name: tag.name })),
  );

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

  await cascadeTagsToSupabaseItems(userId, diff);

  return (data ?? []) as UserTag[];
}
