import {
  applyTagDefinitionDiffToTags,
  type TagDefinitionDiff,
} from "../lib/tag-definition-diff.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

export async function cascadeTagsToSupabaseItems(
  userId: string,
  diff: TagDefinitionDiff,
): Promise<number> {
  if (diff.removed.length === 0 && diff.renames.length === 0) return 0;

  const supabase = getSupabaseAdmin();
  const { data: items, error } = await supabase
    .from("mindtasker_items")
    .select("id, tags")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to load items for tag cascade: ${error.message}`);
  }

  let updated = 0;
  for (const item of items ?? []) {
    const currentTags = (item.tags as string[] | null) ?? [];
    const nextTags = applyTagDefinitionDiffToTags(currentTags, diff);
    if (nextTags.length === currentTags.length && nextTags.every((tag, i) => tag === currentTags[i])) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("mindtasker_items")
      .update({ tags: nextTags })
      .eq("id", item.id);

    if (updateError) {
      throw new Error(`Failed to cascade tags to item ${item.id}: ${updateError.message}`);
    }
    updated += 1;
  }

  return updated;
}
