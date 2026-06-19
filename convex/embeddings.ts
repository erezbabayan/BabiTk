import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";

export const getNotebookForEmbedding = internalQuery({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, { notebookId }) => {
    const notebook = await ctx.db.get(notebookId);
    if (!notebook || notebook.deletedAt !== null) return null;
    return {
      title: notebook.title,
      content: notebook.content,
      correctedText: notebook.correctedText ?? null,
      tags: notebook.tags,
    };
  },
});

export const applyNotebookEmbedding = internalMutation({
  args: {
    notebookId: v.id("notebooks"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, { notebookId, embedding }) => {
    await ctx.db.patch(notebookId, {
      embedding,
      updatedAt: Date.now(),
    });
  },
});
