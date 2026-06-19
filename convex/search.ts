import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Semantic search over notebook entries for a user (embedding cosine similarity). */
export const searchNotebooks = query({
  args: {
    userId: v.id("users"),
    queryEmbedding: v.array(v.float64()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, queryEmbedding, limit = 10 }) => {
    const notebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user_deleted", (q) =>
        q.eq("userId", userId).eq("deletedAt", null),
      )
      .collect();

    const scored: Array<{ notebook: Doc<"notebooks">; score: number }> = [];

    for (const notebook of notebooks) {
      if (!notebook.embedding?.length) continue;
      scored.push({
        notebook,
        score: cosineSimilarity(queryEmbedding, notebook.embedding),
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ notebook, score }) => ({ ...notebook, score }));
  },
});
