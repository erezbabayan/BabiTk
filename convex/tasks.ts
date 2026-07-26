import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { notifyAtPatchValue } from "./lib/notifyAt";
import { requireAuthUserId, requireScopedUserId } from "./lib/requireAuth";
import { sourceType, taskStatus } from "./validators";

function assertUserOwnsTask(
  userId: Id<"users">,
  taskUserId: Id<"users">,
): void {
  if (userId !== taskUserId) {
    throw new Error("Task not found");
  }
}

function isActiveTaskStatus(status: Doc<"tasks">["status"]): boolean {
  return status === "inbox" || status === "pending";
}

export const listActive = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId: requestedUserId }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
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
    const userId = await requireAuthUserId(ctx);
    const now = Date.now();
    const status = args.status ?? "inbox";
    const dueDate = args.dueDate ?? null;
    const metadata = args.metadata;
    return await ctx.db.insert("tasks", {
      userId,
      title: args.title,
      content: args.content,
      status,
      dueDate,
      completedAt: null,
      calendarEventId: null,
      tags: args.tags ?? [],
      metadata,
      notifyAt: notifyAtPatchValue(
        { isTask: true, dueDate, metadata },
        !isActiveTaskStatus(status),
      ),
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
  handler: async (ctx, { userId: requestedUserId, taskId, patch }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    assertUserOwnsTask(userId, task.userId);

    const now = Date.now();
    const nextDue = patch.dueDate !== undefined ? patch.dueDate : task.dueDate;
    const nextMeta = patch.metadata !== undefined ? patch.metadata : task.metadata;
    const nextStatus = patch.status !== undefined ? patch.status : task.status;
    const nextDeleted =
      patch.deletedAt !== undefined ? patch.deletedAt : task.deletedAt;

    await ctx.db.patch(taskId, {
      ...patch,
      notifyAt: notifyAtPatchValue(
        { isTask: true, dueDate: nextDue, metadata: nextMeta },
        typeof nextDeleted === "number" || !isActiveTaskStatus(nextStatus),
      ),
      lastInteractedAt: now,
      updatedAt: now,
    });

    return taskId;
  },
});
