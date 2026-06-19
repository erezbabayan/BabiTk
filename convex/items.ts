import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

export type UnifiedItemKind = "task" | "notebook";

export type UnifiedItem = {
  _id: string;
  kind: UnifiedItemKind;
  userId: Id<"users">;
  title: string;
  content: string;
  isActionable: boolean;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  calendarEventId: string | null;
  tags: string[];
  metadata: unknown;
  sourceType: string | null;
  sourceStorageUrl: string | null;
  sourceStorageId: Id<"_storage"> | null;
  sourceRawText: string | null;
  sortOrder: number;
  lastInteractedAt: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

function taskToUnified(task: Doc<"tasks">): UnifiedItem {
  return {
    _id: task._id,
    kind: "task",
    userId: task.userId,
    title: task.title,
    content: task.content,
    isActionable: true,
    status: task.status,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    calendarEventId: task.calendarEventId,
    tags: task.tags,
    metadata: task.metadata ?? null,
    sourceType: task.sourceType ?? null,
    sourceStorageUrl: task.sourceStorageUrl ?? null,
    sourceStorageId: task.sourceStorageId ?? null,
    sourceRawText: task.sourceRawText ?? null,
    sortOrder: task.sortOrder,
    lastInteractedAt: task.lastInteractedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt,
  };
}

function notebookToUnified(notebook: Doc<"notebooks">): UnifiedItem {
  const status =
    notebook.status === "archived" ? "snoozed_archive" : notebook.status;
  return {
    _id: notebook._id,
    kind: "notebook",
    userId: notebook.userId,
    title: notebook.title,
    content: notebook.content,
    isActionable: false,
    status,
    dueDate: null,
    completedAt: null,
    calendarEventId: null,
    tags: notebook.tags,
    metadata: notebook.metadata ?? null,
    sourceType: notebook.sourceType ?? null,
    sourceStorageUrl: notebook.storageUrl ?? null,
    sourceStorageId: notebook.sourceStorageId ?? null,
    sourceRawText: notebook.rawText ?? null,
    sortOrder: notebook.sortOrder,
    lastInteractedAt: notebook.lastInteractedAt,
    createdAt: notebook.createdAt,
    updatedAt: notebook.updatedAt,
    deletedAt: notebook.deletedAt,
  };
}

/** Unified inbox board — merges tasks + notebooks for Web/Mobile. */
export const listActive = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const [tasks, notebooks] = await Promise.all([
      ctx.db
        .query("tasks")
        .withIndex("by_user_deleted", (q) =>
          q.eq("userId", userId).eq("deletedAt", null),
        )
        .collect(),
      ctx.db
        .query("notebooks")
        .withIndex("by_user_deleted", (q) =>
          q.eq("userId", userId).eq("deletedAt", null),
        )
        .collect(),
    ]);

    const unified = [
      ...tasks.map(taskToUnified),
      ...notebooks.map(notebookToUnified),
    ];

    unified.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return b.createdAt - a.createdAt;
    });

    return unified;
  },
});

const itemPatch = v.object({
  title: v.optional(v.string()),
  content: v.optional(v.string()),
  status: v.optional(v.string()),
  dueDate: v.optional(v.union(v.string(), v.null())),
  completedAt: v.optional(v.union(v.string(), v.null())),
  calendarEventId: v.optional(v.union(v.string(), v.null())),
  tags: v.optional(v.array(v.string())),
  metadata: v.optional(v.any()),
  sortOrder: v.optional(v.number()),
  deletedAt: v.optional(v.union(v.number(), v.null())),
  isActionable: v.optional(v.boolean()),
});

async function loadOwnedItem(
  ctx: MutationCtx,
  userId: Id<"users">,
  itemId: string,
): Promise<
  | { kind: "task"; doc: Doc<"tasks"> }
  | { kind: "notebook"; doc: Doc<"notebooks"> }
  | null
> {
  const task = await ctx.db.get(itemId as Id<"tasks">);
  if (task && task.userId === userId) {
    return { kind: "task", doc: task };
  }

  const notebook = await ctx.db.get(itemId as Id<"notebooks">);
  if (notebook && notebook.userId === userId) {
    return { kind: "notebook", doc: notebook };
  }

  return null;
}

export const update = mutation({
  args: {
    userId: v.id("users"),
    itemId: v.string(),
    patch: itemPatch,
  },
  handler: async (ctx, { userId, itemId, patch }) => {
    const owned = await loadOwnedItem(ctx, userId, itemId);
    if (!owned) throw new Error("Item not found");

    if (patch.isActionable !== undefined && patch.isActionable !== (owned.kind === "task")) {
      throw new Error("Use toggleActionable to convert between task and note");
    }

    const now = Date.now();

    if (owned.kind === "task") {
      const taskPatch: Record<string, unknown> = {
        lastInteractedAt: now,
        updatedAt: now,
      };
      if (patch.title !== undefined) taskPatch.title = patch.title;
      if (patch.content !== undefined) taskPatch.content = patch.content;
      if (patch.tags !== undefined) taskPatch.tags = patch.tags;
      if (patch.metadata !== undefined) taskPatch.metadata = patch.metadata;
      if (patch.sortOrder !== undefined) taskPatch.sortOrder = patch.sortOrder;
      if (patch.deletedAt !== undefined) taskPatch.deletedAt = patch.deletedAt;
      if (patch.dueDate !== undefined) taskPatch.dueDate = patch.dueDate;
      if (patch.completedAt !== undefined) taskPatch.completedAt = patch.completedAt;
      if (patch.calendarEventId !== undefined) {
        taskPatch.calendarEventId = patch.calendarEventId;
      }
      if (patch.status !== undefined) {
        taskPatch.status = patch.status as Doc<"tasks">["status"];
      }

      await ctx.db.patch(owned.doc._id, taskPatch);
      return itemId;
    }

    const notebookPatch: Record<string, unknown> = {
      lastInteractedAt: now,
      updatedAt: now,
    };
    if (patch.title !== undefined) notebookPatch.title = patch.title;
    if (patch.content !== undefined) notebookPatch.content = patch.content;
    if (patch.tags !== undefined) notebookPatch.tags = patch.tags;
    if (patch.metadata !== undefined) notebookPatch.metadata = patch.metadata;
    if (patch.sortOrder !== undefined) notebookPatch.sortOrder = patch.sortOrder;
    if (patch.deletedAt !== undefined) notebookPatch.deletedAt = patch.deletedAt;

    if (patch.status !== undefined) {
      notebookPatch.status = (
        patch.status === "snoozed_archive" ? "archived" : "pending"
      ) as Doc<"notebooks">["status"];
    }

    await ctx.db.patch(owned.doc._id, notebookPatch);
    return itemId;
  },
});

export const toggleActionable = mutation({
  args: {
    userId: v.id("users"),
    itemId: v.string(),
    dueDate: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { userId, itemId, dueDate }) => {
    const owned = await loadOwnedItem(ctx, userId, itemId);
    if (!owned) throw new Error("Item not found");

    const now = Date.now();

    if (owned.kind === "task") {
      const task = owned.doc;
      const notebookId = await ctx.db.insert("notebooks", {
        userId,
        legacyId: task.legacyId,
        title: task.title,
        content: task.content,
        rawText: task.sourceRawText ?? task.content,
        correctedText: null,
        status: task.status === "snoozed_archive" ? "archived" : "pending",
        tags: task.tags,
        metadata: task.metadata,
        sourceType: task.sourceType ?? "whatsapp_text",
        storageUrl: task.sourceStorageUrl ?? null,
        sourceStorageId: task.sourceStorageId,
        sortOrder: task.sortOrder,
        lastInteractedAt: now,
        createdAt: task.createdAt,
        updatedAt: now,
        deletedAt: null,
      });
      await ctx.db.delete(task._id);
      return notebookId;
    }

    const notebook = owned.doc;
    const taskId = await ctx.db.insert("tasks", {
      userId,
      legacyId: notebook.legacyId,
      title: notebook.title,
      content: notebook.content,
      status: "pending",
      dueDate: dueDate ?? null,
      completedAt: null,
      calendarEventId: null,
      tags: notebook.tags,
      metadata: notebook.metadata,
      sourceType: notebook.sourceType,
      sourceStorageUrl: notebook.storageUrl ?? null,
      sourceStorageId: notebook.sourceStorageId,
      sourceRawText: notebook.rawText ?? null,
      sortOrder: notebook.sortOrder,
      lastInteractedAt: now,
      createdAt: notebook.createdAt,
      updatedAt: now,
      deletedAt: null,
    });
    await ctx.db.delete(notebook._id);
    return taskId;
  },
});

/** Resolve signed URL for stored source media. */
export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId);
  },
});
