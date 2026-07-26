import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireScopedUserId } from "./lib/requireAuth";
import { defaultTaskListName } from "./lib/taskListNames";
import {
  listItemsForList,
  replaceListItemsFromTasks,
  resolveTasksForList,
  softDeleteListItems,
  syncTaskToListItems,
} from "./lib/taskListCopy";
import { taskStatus } from "./validators";

const taskListItemDoc = v.object({
  _id: v.id("taskListItems"),
  _creationTime: v.number(),
  userId: v.id("users"),
  listId: v.id("taskLists"),
  sourceTaskId: v.id("tasks"),
  title: v.string(),
  content: v.string(),
  status: taskStatus,
  dueDate: v.union(v.string(), v.null()),
  completedAt: v.union(v.string(), v.null()),
  tags: v.array(v.string()),
  metadata: v.optional(v.any()),
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.union(v.number(), v.null()),
});

const taskListWithItemsDoc = v.object({
  _id: v.id("taskLists"),
  _creationTime: v.number(),
  userId: v.id("users"),
  name: v.string(),
  filterTags: v.array(v.string()),
  reminderAt: v.optional(v.union(v.string(), v.null())),
  /** @deprecated Legacy snapshot ids — replaced by taskListItems. */
  taskIds: v.optional(v.array(v.id("tasks"))),
  status: v.union(v.literal("active"), v.literal("archived")),
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.union(v.number(), v.null()),
  items: v.array(taskListItemDoc),
});

async function nextSortOrder(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<number> {
  const existing = await ctx.db
    .query("taskLists")
    .withIndex("by_user_deleted", (q) => q.eq("userId", userId).eq("deletedAt", null))
    .collect();
  if (existing.length === 0) return 0;
  return Math.max(...existing.map((list) => list.sortOrder)) + 1;
}

export const listForUser = query({
  args: {
    userId: v.id("users"),
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(taskListWithItemsDoc),
  handler: async (ctx, { userId: requestedUserId, includeArchived = true }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const lists = await ctx.db
      .query("taskLists")
      .withIndex("by_user_deleted", (q) => q.eq("userId", userId).eq("deletedAt", null))
      .collect();

    const filtered = includeArchived
      ? lists
      : lists.filter((list) => list.status === "active");

    filtered.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return b.createdAt - a.createdAt;
    });

    const withItems = await Promise.all(
      filtered.map(async (list) => ({
        ...list,
        items: await listItemsForList(ctx, list._id),
      })),
    );

    return withItems;
  },
});

export const createFromTags = mutation({
  args: {
    userId: v.id("users"),
    filterTags: v.array(v.string()),
    name: v.optional(v.string()),
    sourceTaskIds: v.optional(v.array(v.id("tasks"))),
  },
  returns: v.id("taskLists"),
  handler: async (ctx, { userId: requestedUserId, filterTags, name, sourceTaskIds }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const normalizedTags = [...new Set(filterTags.map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))];
    if (normalizedTags.length === 0) {
      throw new Error("יש לבחור לפחות תגית אחת");
    }

    const tasks = await resolveTasksForList(ctx, userId, normalizedTags, sourceTaskIds);

    const now = Date.now();
    const listName = name?.trim() || defaultTaskListName(normalizedTags, now);

    const listId = await ctx.db.insert("taskLists", {
      userId,
      name: listName,
      filterTags: normalizedTags,
      reminderAt: null,
      status: "active",
      sortOrder: await nextSortOrder(ctx, userId),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    if (tasks.length > 0) {
      await replaceListItemsFromTasks(ctx, listId, userId, tasks);
    }
    return listId;
  },
});

/**
 * Create one list per selected tag (not a single combined multi-tag list).
 * Optional `name` applies only when a single tag is selected.
 */
export const createListsFromTags = mutation({
  args: {
    userId: v.id("users"),
    filterTags: v.array(v.string()),
    name: v.optional(v.string()),
    /** Parallel to normalized unique tags — each entry is source task ids for that tag. */
    sourceTaskIdsByTag: v.optional(v.array(v.array(v.id("tasks")))),
  },
  returns: v.array(v.id("taskLists")),
  handler: async (ctx, { userId: requestedUserId, filterTags, name, sourceTaskIdsByTag }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const normalizedTags = [...new Set(filterTags.map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))];
    if (normalizedTags.length === 0) {
      throw new Error("יש לבחור לפחות תגית אחת");
    }

    const now = Date.now();
    const createdIds: Id<"taskLists">[] = [];
    let sortOrder = await nextSortOrder(ctx, userId);

    for (const [index, tag] of normalizedTags.entries()) {
      const tagSourceIds = sourceTaskIdsByTag?.[index];
      const tasks = await resolveTasksForList(
        ctx,
        userId,
        [tag],
        tagSourceIds && tagSourceIds.length > 0 ? tagSourceIds : undefined,
      );

      const listName =
        normalizedTags.length === 1 && name?.trim()
          ? name.trim()
          : defaultTaskListName([tag], now);

      const listId = await ctx.db.insert("taskLists", {
        userId,
        name: listName,
        filterTags: [tag],
        reminderAt: null,
        status: "active",
        sortOrder,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      sortOrder += 1;

      if (tasks.length > 0) {
        await replaceListItemsFromTasks(ctx, listId, userId, tasks);
      }
      createdIds.push(listId);
    }

    return createdIds;
  },
});

export const updateList = mutation({
  args: {
    userId: v.id("users"),
    listId: v.id("taskLists"),
    name: v.optional(v.string()),
    filterTags: v.optional(v.array(v.string())),
    reminderAt: v.optional(v.union(v.string(), v.null())),
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
  },
  returns: v.id("taskLists"),
  handler: async (ctx, { userId: requestedUserId, listId, name, filterTags, reminderAt, status }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const list = await ctx.db.get(listId);
    if (!list || list.userId !== userId || list.deletedAt !== null) {
      throw new Error("רשימה לא נמצאה");
    }

    const patch: Partial<Doc<"taskLists">> = {
      updatedAt: Date.now(),
    };

    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("שם הרשימה לא יכול להיות ריק");
      patch.name = trimmed;
    }

    if (filterTags !== undefined) {
      const normalizedTags = [...new Set(filterTags.map((tag) => tag.trim().replace(/^#/, "")).filter(Boolean))];
      if (normalizedTags.length === 0) {
        throw new Error("יש לבחור לפחות תגית אחת");
      }
      const tasks = await resolveTasksForList(ctx, userId, normalizedTags);
      patch.filterTags = normalizedTags;
      await replaceListItemsFromTasks(ctx, listId, userId, tasks);
    }

    if (status !== undefined) {
      patch.status = status;
    }

    if (reminderAt !== undefined) {
      if (reminderAt !== null) {
        const parsed = new Date(reminderAt);
        if (!Number.isFinite(parsed.getTime())) {
          throw new Error("תאריך תזכורת לא תקין");
        }
      }
      patch.reminderAt = reminderAt;
    }

    await ctx.db.patch(listId, patch);
    return listId;
  },
});

export const updateListItem = mutation({
  args: {
    userId: v.id("users"),
    listItemId: v.id("taskListItems"),
    patch: v.object({
      title: v.optional(v.string()),
      content: v.optional(v.string()),
      status: v.optional(taskStatus),
      dueDate: v.optional(v.union(v.string(), v.null())),
      completedAt: v.optional(v.union(v.string(), v.null())),
      tags: v.optional(v.array(v.string())),
      metadata: v.optional(v.any()),
    }),
  },
  returns: v.id("taskListItems"),
  handler: async (ctx, { userId: requestedUserId, listItemId, patch }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const listItem = await ctx.db.get(listItemId);
    if (!listItem || listItem.userId !== userId || listItem.deletedAt !== null) {
      throw new Error("פריט רשימה לא נמצא");
    }

    const now = Date.now();
    const itemPatch: Partial<Doc<"taskListItems">> = { updatedAt: now };
    if (patch.title !== undefined) itemPatch.title = patch.title;
    if (patch.content !== undefined) itemPatch.content = patch.content;
    if (patch.tags !== undefined) itemPatch.tags = patch.tags;
    if (patch.metadata !== undefined) itemPatch.metadata = patch.metadata;
    if (patch.dueDate !== undefined) itemPatch.dueDate = patch.dueDate;
    if (patch.completedAt !== undefined) itemPatch.completedAt = patch.completedAt;
    if (patch.status !== undefined) itemPatch.status = patch.status;

    await ctx.db.patch(listItemId, itemPatch);

    const task = await ctx.db.get(listItem.sourceTaskId);
    if (task && task.userId === userId && task.deletedAt === null) {
      const taskPatch: Partial<Doc<"tasks">> = {
        lastInteractedAt: now,
        updatedAt: now,
      };
      if (patch.title !== undefined) taskPatch.title = patch.title;
      if (patch.content !== undefined) taskPatch.content = patch.content;
      if (patch.tags !== undefined) taskPatch.tags = patch.tags;
      if (patch.metadata !== undefined) taskPatch.metadata = patch.metadata;
      if (patch.dueDate !== undefined) taskPatch.dueDate = patch.dueDate;
      if (patch.completedAt !== undefined) taskPatch.completedAt = patch.completedAt;
      if (patch.status !== undefined) taskPatch.status = patch.status;

      await ctx.db.patch(task._id, taskPatch);
      const updatedTask = await ctx.db.get(task._id);
      if (updatedTask) {
        await syncTaskToListItems(ctx, updatedTask);
      }
    }

    return listItemId;
  },
});

export const backfillEmptyLists = mutation({
  args: {
    userId: v.id("users"),
  },
  returns: v.number(),
  handler: async (ctx, { userId: requestedUserId }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const lists = await ctx.db
      .query("taskLists")
      .withIndex("by_user_deleted", (q) => q.eq("userId", userId).eq("deletedAt", null))
      .collect();

    let backfilled = 0;
    for (const list of lists) {
      const items = await listItemsForList(ctx, list._id);
      if (items.length > 0 || list.filterTags.length === 0) continue;

      const tasks = await resolveTasksForList(ctx, userId, list.filterTags);
      if (tasks.length === 0) continue;

      await replaceListItemsFromTasks(ctx, list._id, userId, tasks);
      backfilled += 1;
    }

    return backfilled;
  },
});

export const refreshListItems = mutation({
  args: {
    userId: v.id("users"),
    listId: v.id("taskLists"),
    sourceTaskIds: v.optional(v.array(v.id("tasks"))),
  },
  returns: v.number(),
  handler: async (ctx, { userId: requestedUserId, listId, sourceTaskIds }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const list = await ctx.db.get(listId);
    if (!list || list.userId !== userId || list.deletedAt !== null) {
      throw new Error("רשימה לא נמצאה");
    }

    const tasks = await resolveTasksForList(ctx, userId, list.filterTags, sourceTaskIds);
    await replaceListItemsFromTasks(ctx, listId, userId, tasks);
    await ctx.db.patch(listId, { updatedAt: Date.now() });
    return tasks.length;
  },
});

export const archiveList = mutation({
  args: {
    userId: v.id("users"),
    listId: v.id("taskLists"),
  },
  returns: v.id("taskLists"),
  handler: async (ctx, { userId: requestedUserId, listId }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const list = await ctx.db.get(listId);
    if (!list || list.userId !== userId || list.deletedAt !== null) {
      throw new Error("רשימה לא נמצאה");
    }

    await ctx.db.patch(listId, {
      status: "archived",
      updatedAt: Date.now(),
    });
    return listId;
  },
});

export const restoreList = mutation({
  args: {
    userId: v.id("users"),
    listId: v.id("taskLists"),
  },
  returns: v.id("taskLists"),
  handler: async (ctx, { userId: requestedUserId, listId }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const list = await ctx.db.get(listId);
    if (!list || list.userId !== userId || list.deletedAt !== null) {
      throw new Error("רשימה לא נמצאה");
    }

    await ctx.db.patch(listId, {
      status: "active",
      updatedAt: Date.now(),
    });
    return listId;
  },
});

export const deleteList = mutation({
  args: {
    userId: v.id("users"),
    listId: v.id("taskLists"),
  },
  returns: v.null(),
  handler: async (ctx, { userId: requestedUserId, listId }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const list = await ctx.db.get(listId);
    if (!list || list.userId !== userId || list.deletedAt !== null) {
      throw new Error("רשימה לא נמצאה");
    }

    const now = Date.now();
    await softDeleteListItems(ctx, listId);
    await ctx.db.patch(listId, {
      deletedAt: now,
      updatedAt: now,
    });
    return null;
  },
});
