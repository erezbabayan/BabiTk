import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { notebookStatus, sourceType } from "./validators";

function assertUserOwnsNotebook(
  userId: Id<"users">,
  notebookUserId: Id<"users">,
): void {
  if (userId !== notebookUserId) {
    throw new Error("Notebook not found");
  }
}

export const listActive = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const notebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user_deleted", (q) =>
        q.eq("userId", userId).eq("deletedAt", null),
      )
      .collect();

    notebooks.sort((a, b) => b.createdAt - a.createdAt);
    return notebooks;
  },
});

export const create = mutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    content: v.string(),
    rawText: v.optional(v.union(v.string(), v.null())),
    correctedText: v.optional(v.union(v.string(), v.null())),
    status: v.optional(notebookStatus),
    tags: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
    sourceType,
    storageUrl: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("notebooks", {
      userId: args.userId,
      title: args.title,
      content: args.content,
      rawText: args.rawText ?? null,
      correctedText: args.correctedText ?? null,
      status: args.status ?? "pending",
      tags: args.tags ?? [],
      metadata: args.metadata,
      sourceType: args.sourceType,
      storageUrl: args.storageUrl ?? null,
      sortOrder: now,
      lastInteractedAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  },
});

export const update = mutation({
  args: {
    userId: v.id("users"),
    notebookId: v.id("notebooks"),
    patch: v.object({
      title: v.optional(v.string()),
      content: v.optional(v.string()),
      rawText: v.optional(v.union(v.string(), v.null())),
      correctedText: v.optional(v.union(v.string(), v.null())),
      status: v.optional(notebookStatus),
      tags: v.optional(v.array(v.string())),
      metadata: v.optional(v.any()),
      deletedAt: v.optional(v.union(v.number(), v.null())),
    }),
  },
  handler: async (ctx, { userId, notebookId, patch }) => {
    const notebook = await ctx.db.get(notebookId);
    if (!notebook) throw new Error("Notebook not found");
    assertUserOwnsNotebook(userId, notebook.userId);

    const now = Date.now();
    await ctx.db.patch(notebookId, {
      ...patch,
      lastInteractedAt: now,
      updatedAt: now,
    });

    return notebookId;
  },
});
