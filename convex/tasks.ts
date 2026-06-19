import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { sourceType, taskStatus } from "./validators";

function assertUserOwnsTask(
  userId: Id<"users">,
  taskUserId: Id<"users">,
): void {
  if (userId !== taskUserId) {
    throw new Error("Task not found");
  }
}

export const listActive = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_deleted", (q) =>
        q.eq("userId", userId).eq("deletedAt", null),
      )
      .collect();

    tasks.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return b.createdAt - a.createdAt;
    });

    return tasks;
  },
});

export const create = mutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    content: v.string(),
    status: v.optional(taskStatus),
    dueDate: v.optional(v.union(v.string(), v.null())),
    tags: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
    sourceType: v.optional(sourceType),
    sourceStorageUrl: v.optional(v.union(v.string(), v.null())),
    sourceRawText: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("tasks", {
      userId: args.userId,
      title: args.title,
      content: args.content,
      status: args.status ?? "inbox",
      dueDate: args.dueDate ?? null,
      completedAt: null,
      calendarEventId: null,
      tags: args.tags ?? [],
      metadata: args.metadata,
      sourceType: args.sourceType,
      sourceStorageUrl: args.sourceStorageUrl ?? null,
      sourceRawText: args.sourceRawText ?? null,
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
    taskId: v.id("tasks"),
    patch: v.object({
      title: v.optional(v.string()),
      content: v.optional(v.string()),
      status: v.optional(taskStatus),
      dueDate: v.optional(v.union(v.string(), v.null())),
      completedAt: v.optional(v.union(v.string(), v.null())),
      calendarEventId: v.optional(v.union(v.string(), v.null())),
      tags: v.optional(v.array(v.string())),
      metadata: v.optional(v.any()),
      sortOrder: v.optional(v.number()),
      deletedAt: v.optional(v.union(v.number(), v.null())),
    }),
  },
  handler: async (ctx, { userId, taskId, patch }) => {
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    assertUserOwnsTask(userId, task.userId);

    const now = Date.now();
    await ctx.db.patch(taskId, {
      ...patch,
      lastInteractedAt: now,
      updatedAt: now,
    });

    return taskId;
  },
});
