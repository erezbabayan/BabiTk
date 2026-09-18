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
  const pageSize = 500;
  const pending: Array<{ id: string; tags: string[] }> = [];

  for (let from = 0; from < 20_000; from += pageSize) {
    const { data: items, error } = await supabase
      .from("mindtasker_items")
      .select("id, tags")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load items for tag cascade: ${error.message}`);
    }

    const page = items ?? [];
    for (const item of page) {
      const currentTags = (item.tags as string[] | null) ?? [];
      const nextTags = applyTagDefinitionDiffToTags(currentTags, diff);
      if (nextTags.length === currentTags.length && nextTags.every((tag, i) => tag === currentTags[i])) {
        continue;
      }
      pending.push({ id: item.id, tags: nextTags });
    }
    if (page.length < pageSize) break;
  }

  const chunkSize = 25;
  for (let i = 0; i < pending.length; i += chunkSize) {
    const chunk = pending.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((item) =>
        supabase.from("mindtasker_items").update({ tags: item.tags }).eq("id", item.id),
      ),
    );
    for (const result of results) {
      if (result.error) {
        throw new Error(`Failed to cascade tags: ${result.error.message}`);
      }
    }
  }

  return pending.length;
}
