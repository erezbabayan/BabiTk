import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Active today-board tasks only — not archive, completed, or inbox. */
const TODAY_BOARD_TASK_STATUS: Doc<"tasks">["status"] = "pending";

function isTodayBoardTask(task: Doc<"tasks">): boolean {
  return task.deletedAt === null && task.status === TODAY_BOARD_TASK_STATUS;
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, "");
}

function taskMatchesTags(task: Doc<"tasks">, filterTags: string[]): boolean {
  const tagSet = new Set(filterTags.map(normalizeTag).filter(Boolean));
  if (tagSet.size === 0) return false;
  return task.tags.some((tag) => tagSet.has(normalizeTag(tag)));
}

/** Tasks on the today board with matching tags (pending only). */
export async function loadTasksForListTags(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  filterTags: string[],
): Promise<Doc<"tasks">[]> {
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", TODAY_BOARD_TASK_STATUS))
    .collect();

  return tasks
    .filter((task) => isTodayBoardTask(task) && taskMatchesTags(task, filterTags))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return b.createdAt - a.createdAt;
    });
}

/** @deprecated Use loadTasksForListTags */
export const loadTodayTasksForTags = loadTasksForListTags;

export async function loadTasksByIds(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  sourceTaskIds: Id<"tasks">[],
): Promise<Doc<"tasks">[]> {
  const uniqueIds = [...new Set(sourceTaskIds)];
  const tasks: Doc<"tasks">[] = [];

  for (const taskId of uniqueIds) {
    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId || !isTodayBoardTask(task)) continue;
    tasks.push(task);
  }

  tasks.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return b.createdAt - a.createdAt;
  });

  return tasks;
}

export async function resolveTasksForList(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  filterTags: string[],
  sourceTaskIds?: Id<"tasks">[],
): Promise<Doc<"tasks">[]> {
  const normalizedTags = [...new Set(filterTags.map(normalizeTag).filter(Boolean))];

  if (sourceTaskIds && sourceTaskIds.length > 0) {
    const byIds = await loadTasksByIds(ctx, userId, sourceTaskIds);
    const tagged = byIds.filter((task) => taskMatchesTags(task, normalizedTags));
    if (tagged.length > 0) return tagged;
  }

  return await loadTasksForListTags(ctx, userId, normalizedTags);
}

export async function copyTaskToListItem(
  ctx: MutationCtx,
  listId: Id<"taskLists">,
  userId: Id<"users">,
  task: Doc<"tasks">,
  sortOrder: number,
): Promise<Id<"taskListItems">> {
  const now = Date.now();
  return await ctx.db.insert("taskListItems", {
    userId,
    listId,
    sourceTaskId: task._id,
    title: task.title,
    content: task.content,
    status: task.status,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    tags: [...task.tags],
    metadata: task.metadata,
    sortOrder,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
}

export async function replaceListItemsFromTasks(
  ctx: MutationCtx,
  listId: Id<"taskLists">,
  userId: Id<"users">,
  tasks: Doc<"tasks">[],
): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db
    .query("taskListItems")
    .withIndex("by_list_deleted", (q) => q.eq("listId", listId).eq("deletedAt", null))
    .collect();

  for (const item of existing) {
    await ctx.db.patch(item._id, { deletedAt: now, updatedAt: now });
  }

  for (const [index, task] of tasks.entries()) {
    await copyTaskToListItem(ctx, listId, userId, task, (index + 1) * 10);
  }
}

export async function softDeleteListItemsForTask(
  ctx: MutationCtx,
  sourceTaskId: Id<"tasks">,
): Promise<void> {
  const now = Date.now();
  const listItems = await ctx.db
    .query("taskListItems")
    .withIndex("by_source_task", (q) => q.eq("sourceTaskId", sourceTaskId))
    .collect();

  for (const item of listItems) {
    if (item.deletedAt === null) {
      await ctx.db.patch(item._id, { deletedAt: now, updatedAt: now });
    }
  }
}

export async function syncTaskToListItems(
  ctx: MutationCtx,
  task: Doc<"tasks">,
): Promise<void> {
  const listItems = await ctx.db
    .query("taskListItems")
    .withIndex("by_source_task", (q) => q.eq("sourceTaskId", task._id))
    .collect();

  const now = Date.now();
  for (const item of listItems) {
    if (task.deletedAt !== null) {
      if (item.deletedAt === null) {
        await ctx.db.patch(item._id, { deletedAt: now, updatedAt: now });
      }
      continue;
    }

    await ctx.db.patch(item._id, {
      title: task.title,
      content: task.content,
      status: task.status,
      dueDate: task.dueDate,
      completedAt: task.completedAt,
      tags: task.tags,
      metadata: task.metadata,
      updatedAt: now,
      deletedAt: null,
    });
  }
}

export async function listItemsForList(
  ctx: QueryCtx,
  listId: Id<"taskLists">,
): Promise<Doc<"taskListItems">[]> {
  const items = await ctx.db
    .query("taskListItems")
    .withIndex("by_list_deleted", (q) => q.eq("listId", listId).eq("deletedAt", null))
    .collect();

  items.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return b.createdAt - a.createdAt;
  });

  return items;
}

export async function softDeleteListItems(
  ctx: MutationCtx,
  listId: Id<"taskLists">,
): Promise<void> {
  const now = Date.now();
  const items = await ctx.db
    .query("taskListItems")
    .withIndex("by_list", (q) => q.eq("listId", listId))
    .collect();

  for (const item of items) {
    if (item.deletedAt === null) {
      await ctx.db.patch(item._id, { deletedAt: now, updatedAt: now });
    }
  }
}
