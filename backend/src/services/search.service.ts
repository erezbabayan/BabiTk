import { getSupabaseAdmin } from "../lib/supabase.js";
import {
  buildNoteEmbeddingText,
  createEmbedding,
  formatVectorForPostgres,
} from "./embedding.service.js";
import type { DbMindtaskerItem } from "../types/database.js";

export type SearchScope = "all" | "inbox" | "today" | "notes";

export interface ItemSearchResult {
  id: string;
  title: string;
  content: string;
  tags: string[];
  is_actionable: boolean;
  status: string;
  similarity: number;
}

export async function syncItemEmbedding(itemId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: item, error: readError } = await supabase
    .from("mindtasker_items")
    .select("id, title, content, tags")
    .eq("id", itemId)
    .single();

  if (readError || !item) {
    throw new Error(`Item not found for embedding: ${readError?.message ?? itemId}`);
  }

  const text = buildNoteEmbeddingText(item.title, item.content, item.tags ?? []);
  const vector = await createEmbedding(text);

  const { error } = await supabase
    .from("mindtasker_items")
    .update({ embedding: formatVectorForPostgres(vector) })
    .eq("id", itemId);

  if (error) {
    throw new Error(`Failed to store item embedding: ${error.message}`);
  }
}

/** @deprecated Use syncItemEmbedding */
export const syncNoteEmbedding = syncItemEmbedding;

export async function clearItemEmbedding(itemId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("mindtasker_items")
    .update({ embedding: null })
    .eq("id", itemId);

  if (error) {
    throw new Error(`Failed to clear embedding: ${error.message}`);
  }
}

/** @deprecated Use clearItemEmbedding */
export const clearNoteEmbedding = clearItemEmbedding;

export async function searchItems(
  userId: string,
  query: string,
  options?: {
    matchCount?: number;
    matchThreshold?: number;
    scope?: SearchScope;
  },
): Promise<ItemSearchResult[]> {
  const queryVector = await createEmbedding(query);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc("search_items_for_user", {
    p_user_id: userId,
    query_embedding: formatVectorForPostgres(queryVector),
    match_count: options?.matchCount ?? 10,
    match_threshold: options?.matchThreshold ?? 0.45,
    p_scope: options?.scope ?? "all",
  });

  if (error) {
    throw new Error(`Semantic search failed: ${error.message}`);
  }

  return (data ?? []) as ItemSearchResult[];
}

/** @deprecated Use searchItems */
export async function searchNotes(
  userId: string,
  query: string,
  options?: { matchCount?: number; matchThreshold?: number },
): Promise<ItemSearchResult[]> {
  return searchItems(userId, query, { ...options, scope: "notes" });
}

export async function syncEmbeddingsForItems(itemIds: string[]): Promise<void> {
  for (const id of itemIds) {
    await syncItemEmbedding(id);
  }
}

/** @deprecated Use syncEmbeddingsForItems */
export const syncEmbeddingsForNotes = syncEmbeddingsForItems;

export function filterNoteIds(items: Pick<DbMindtaskerItem, "id" | "is_actionable">[]): string[] {
  return items.filter((item) => !item.is_actionable).map((item) => item.id);
}
