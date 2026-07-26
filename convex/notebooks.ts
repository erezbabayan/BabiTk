import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { notifyAtPatchValue } from "./lib/notifyAt";
import { requireAuthUserId, requireScopedUserId } from "./lib/requireAuth";
import { notebookStatus, sourceType } from "./validators";

function assertUserOwnsNotebook(
  userId: Id<"users">,
  notebookUserId: Id<"users">,
): void {
  if (userId !== notebookUserId) {
    throw new Error("Notebook not found");
  }
}

function isActiveNotebookStatus(status: Doc<"notebooks">["status"]): boolean {
  return status === "inbox" || status === "pending";
}

export const listActive = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId: requestedUserId }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
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
    dueDate: v.optional(v.union(v.string(), v.null())),
    tags: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
    sourceType,
    storageUrl: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const now = Date.now();
    const status = args.status ?? "pending";
    const dueDate = args.dueDate ?? null;
    const metadata = args.metadata;
    return await ctx.db.insert("notebooks", {
      userId,
      title: args.title,
      content: args.content,
      rawText: args.rawText ?? null,
      correctedText: args.correctedText ?? null,
      status,
      tags: args.tags ?? [],
      metadata,
      dueDate,
      notifyAt: notifyAtPatchValue(
        { isTask: false, dueDate, metadata },
        !isActiveNotebookStatus(status),
      ),
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
      dueDate: v.optional(v.union(v.string(), v.null())),
      tags: v.optional(v.array(v.string())),
      metadata: v.optional(v.any()),
      deletedAt: v.optional(v.union(v.number(), v.null())),
    }),
  },
  handler: async (ctx, { userId: requestedUserId, notebookId, patch }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const notebook = await ctx.db.get(notebookId);
    if (!notebook) throw new Error("Notebook not found");
    assertUserOwnsNotebook(userId, notebook.userId);

    const now = Date.now();
    const nextDue =
      patch.dueDate !== undefined ? patch.dueDate : (notebook.dueDate ?? null);
    const nextMeta =
      patch.metadata !== undefined ? patch.metadata : notebook.metadata;
    const nextStatus = patch.status !== undefined ? patch.status : notebook.status;
    const nextDeleted =
      patch.deletedAt !== undefined ? patch.deletedAt : notebook.deletedAt;

    await ctx.db.patch(notebookId, {
      ...patch,
      notifyAt: notifyAtPatchValue(
        { isTask: false, dueDate: nextDue, metadata: nextMeta },
        typeof nextDeleted === "number" || !isActiveNotebookStatus(nextStatus),
      ),
      lastInteractedAt: now,
      updatedAt: now,
    });

    return notebookId;
  },
});
