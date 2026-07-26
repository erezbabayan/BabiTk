import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { requireScopedUserId } from "./lib/requireAuth";
import { syncTaskToListItems } from "./lib/taskListCopy";

function transformItemTags(
  tags: string[],
  renameMap: Map<string, string>,
  removedSet: Set<string>,
): string[] {
  const next: string[] = [];
  for (const tag of tags) {
    if (removedSet.has(tag)) continue;
    next.push(renameMap.get(tag) ?? tag);
  }
  return [...new Set(next)];
}

function tagsChanged(before: string[], after: string[]): boolean {
  if (before.length !== after.length) return true;
  return before.some((tag, index) => tag !== after[index]);
}

export const applyDefinitionChanges = mutation({
  args: {
    userId: v.id("users"),
    renames: v.array(v.object({ from: v.string(), to: v.string() })),
    removed: v.array(v.string()),
  },
  returns: v.object({
    tasksUpdated: v.number(),
    notebooksUpdated: v.number(),
    listsUpdated: v.number(),
    listItemsUpdated: v.number(),
  }),
  handler: async (ctx, { userId: requestedUserId, renames, removed }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    if (renames.length === 0 && removed.length === 0) {
      return {
        tasksUpdated: 0,
        notebooksUpdated: 0,
        listsUpdated: 0,
        listItemsUpdated: 0,
      };
    }

    const renameMap = new Map(renames.map((entry) => [entry.from, entry.to]));
    const removedSet = new Set(removed);
    const now = Date.now();

    let tasksUpdated = 0;
    let notebooksUpdated = 0;
    let listsUpdated = 0;
    let listItemsUpdated = 0;

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_deleted", (q) => q.eq("userId", userId).eq("deletedAt", null))
      .collect();

    for (const task of tasks) {
      const nextTags = transformItemTags(task.tags, renameMap, removedSet);
      if (!tagsChanged(task.tags, nextTags)) continue;

      await ctx.db.patch(task._id, {
        tags: nextTags,
        updatedAt: now,
        lastInteractedAt: now,
      });
      const updatedTask = await ctx.db.get(task._id);
      if (updatedTask) {
        await syncTaskToListItems(ctx, updatedTask);
      }
      tasksUpdated += 1;
    }

    const notebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user_deleted", (q) => q.eq("userId", userId).eq("deletedAt", null))
      .collect();

    for (const notebook of notebooks) {
      const nextTags = transformItemTags(notebook.tags, renameMap, removedSet);
      if (!tagsChanged(notebook.tags, nextTags)) continue;

      await ctx.db.patch(notebook._id, {
        tags: nextTags,
        updatedAt: now,
        lastInteractedAt: now,
      });
      notebooksUpdated += 1;
    }

    const lists = await ctx.db
      .query("taskLists")
      .withIndex("by_user_deleted", (q) => q.eq("userId", userId).eq("deletedAt", null))
      .collect();

    for (const list of lists) {
      const nextFilterTags = transformItemTags(list.filterTags, renameMap, removedSet);
      if (!tagsChanged(list.filterTags, nextFilterTags)) continue;

      const patch: Partial<Doc<"taskLists">> = {
        filterTags: nextFilterTags,
        updatedAt: now,
      };
      await ctx.db.patch(list._id, patch);
      listsUpdated += 1;
    }

    const listItems = await ctx.db
      .query("taskListItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const listItem of listItems) {
      if (listItem.deletedAt !== null) continue;
      const nextTags = transformItemTags(listItem.tags, renameMap, removedSet);
      if (!tagsChanged(listItem.tags, nextTags)) continue;

      await ctx.db.patch(listItem._id, {
        tags: nextTags,
        updatedAt: now,
      });
      listItemsUpdated += 1;
    }

    return {
      tasksUpdated,
      notebooksUpdated,
      listsUpdated,
      listItemsUpdated,
    };
  },
});
