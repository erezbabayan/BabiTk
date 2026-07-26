import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireAuthUserId } from "./lib/requireAuth";

const notificationDoc = v.object({
  _id: v.id("notifications"),
  _creationTime: v.number(),
  userId: v.id("users"),
  kind: v.union(v.literal("item_reminder"), v.literal("list_reminder")),
  title: v.string(),
  body: v.string(),
  taskId: v.optional(v.id("tasks")),
  notebookId: v.optional(v.id("notebooks")),
  listId: v.optional(v.id("taskLists")),
  fireAt: v.string(),
  dedupeKey: v.string(),
  read: v.boolean(),
  readAt: v.optional(v.number()),
  createdAt: v.number(),
});

async function resolveViewerUserId(
  ctx: QueryCtx,
  requested?: Id<"users">,
): Promise<Id<"users"> | null> {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) return null;
  // Soft-ignore client/auth id mismatch — throwing breaks reactive useQuery UIs.
  if (requested && requested !== authUserId) {
    return null;
  }
  return authUserId;
}

async function insertReminderNotice(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    kind: "item_reminder" | "list_reminder";
    title: string;
    body: string;
    taskId?: Id<"tasks">;
    notebookId?: Id<"notebooks">;
    listId?: Id<"taskLists">;
    fireAt: string;
    dedupeKey: string;
  },
): Promise<Id<"notifications"> | null> {
  const existing = await ctx.db
    .query("notifications")
    .withIndex("by_user_dedupe", (q) =>
      q.eq("userId", args.userId).eq("dedupeKey", args.dedupeKey),
    )
    .unique();
  if (existing) return existing._id;

  return await ctx.db.insert("notifications", {
    userId: args.userId,
    kind: args.kind,
    title: args.title,
    body: args.body,
    taskId: args.taskId,
    notebookId: args.notebookId,
    listId: args.listId,
    fireAt: args.fireAt,
    dedupeKey: args.dedupeKey,
    read: false,
    createdAt: Date.now(),
  });
}

export const listMine = query({
  args: {
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  returns: v.array(notificationDoc),
  handler: async (ctx, args) => {
    const userId = await resolveViewerUserId(ctx, args.userId);
    if (!userId) return [];
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    return await ctx.db
      .query("notifications")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
  },
});

export const unreadCount = query({
  args: {
    userId: v.optional(v.id("users")),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const userId = await resolveViewerUserId(ctx, args.userId);
    if (!userId) return 0;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) => q.eq("userId", userId).eq("read", false))
      .take(100);
    return unread.length;
  },
});

/**
 * When the user sets a reminder that is already due / about to fire (<2 min),
 * push an in-app row immediately so the center updates without waiting for cron.
 */
export const ensureSoonReminder = mutation({
  args: {
    kind: v.union(v.literal("task"), v.literal("notebook"), v.literal("list")),
    taskId: v.optional(v.id("tasks")),
    notebookId: v.optional(v.id("notebooks")),
    listId: v.optional(v.id("taskLists")),
    title: v.string(),
    fireAt: v.string(),
  },
  returns: v.union(v.id("notifications"), v.null()),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const fireMs = Date.parse(args.fireAt);
    if (!Number.isFinite(fireMs)) return null;
    // Only materialize immediately when due now / within a few seconds.
    // Near-future reminders (e.g. "in 1 minute") wait for cron / local OS schedule.
    if (fireMs > Date.now() + 5_000) return null;

    if (args.kind === "task") {
      if (!args.taskId) throw new Error("taskId required");
      const task = await ctx.db.get(args.taskId);
      if (!task || task.userId !== userId) throw new Error("Unauthorized");
    } else if (args.kind === "notebook") {
      if (!args.notebookId) throw new Error("notebookId required");
      const notebook = await ctx.db.get(args.notebookId);
      if (!notebook || notebook.userId !== userId) throw new Error("Unauthorized");
    } else {
      if (!args.listId) throw new Error("listId required");
      const list = await ctx.db.get(args.listId);
      if (!list || list.userId !== userId) throw new Error("Unauthorized");
    }

    let dueLabel: string | null = null;
    try {
      dueLabel = new Date(args.fireAt).toLocaleString("he-IL", {
        day: "numeric",
        month: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      dueLabel = null;
    }

    const dedupeKey =
      args.kind === "task"
        ? `task:${args.taskId}:${args.fireAt}`
        : args.kind === "notebook"
          ? `notebook:${args.notebookId}:${args.fireAt}`
          : `list:${args.listId}:${args.fireAt}`;

    return await insertReminderNotice(ctx, {
      userId,
      kind: args.kind === "list" ? "list_reminder" : "item_reminder",
      title: `תזכורת: ${args.title}`,
      body: (dueLabel ? `מועד יעד: ${dueLabel}\n` : "") + "פתח את BabaiTk לפרטים.",
      taskId: args.taskId,
      notebookId: args.notebookId,
      listId: args.listId,
      fireAt: args.fireAt,
      dedupeKey,
    });
  },
});

export const markRead = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const row = await ctx.db.get(args.notificationId);
    // Missing/foreign id is expected (stale client) — soft no-op.
    if (!row || row.userId !== userId) {
      return null;
    }
    if (!row.read) {
      await ctx.db.patch(args.notificationId, {
        read: true,
        readAt: Date.now(),
      });
    }
    return null;
  },
});

export const markAllRead = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", (q) => q.eq("userId", userId).eq("read", false))
      .take(200);
    const now = Date.now();
    for (const row of unread) {
      await ctx.db.patch(row._id, { read: true, readAt: now });
    }
    return unread.length;
  },
});
