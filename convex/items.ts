import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireScopedUserId } from "./lib/requireAuth";
import { getReminderFlags } from "./lib/resolveItemReminder";
import { computeNotifyAt, notifyAtPatchValue } from "./lib/notifyAt";
import { syncTaskToListItems, softDeleteListItemsForTask } from "./lib/taskListCopy";
import {
  ensureWhatsappIngestReceipt,
  readWhatsappMessageId,
} from "./lib/whatsappIngestReceipt";

const BOARD_QUERY_LIMIT = 500;

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
    dueDate: notebook.dueDate ?? null,
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

function mergeUnifiedSorted(
  tasks: Doc<"tasks">[],
  notebooks: Doc<"notebooks">[],
): UnifiedItem[] {
  const unified = [
    ...tasks.map(taskToUnified),
    ...notebooks.map(notebookToUnified),
  ];
  unified.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return b.createdAt - a.createdAt;
  });
  return unified;
}

function isActiveTaskStatus(status: Doc<"tasks">["status"]): boolean {
  return status === "inbox" || status === "pending";
}

function isActiveNotebookStatus(status: Doc<"notebooks">["status"]): boolean {
  return status === "inbox" || status === "pending";
}

const unifiedItemValidator = v.object({
  _id: v.string(),
  kind: v.union(v.literal("task"), v.literal("notebook")),
  userId: v.id("users"),
  title: v.string(),
  content: v.string(),
  isActionable: v.boolean(),
  status: v.string(),
  dueDate: v.union(v.string(), v.null()),
  completedAt: v.union(v.string(), v.null()),
  calendarEventId: v.union(v.string(), v.null()),
  tags: v.array(v.string()),
  metadata: v.any(),
  sourceType: v.union(v.string(), v.null()),
  sourceStorageUrl: v.union(v.string(), v.null()),
  sourceStorageId: v.union(v.id("_storage"), v.null()),
  sourceRawText: v.union(v.string(), v.null()),
  sortOrder: v.number(),
  lastInteractedAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.union(v.number(), v.null()),
});

/** One board column — smaller reactive payload than listActive. */
export const listBoardColumn = query({
  args: {
    userId: v.id("users"),
    column: v.union(
      v.literal("inbox"),
      v.literal("today"),
      v.literal("notes"),
    ),
  },
  returns: v.array(unifiedItemValidator),
  handler: async (ctx, { userId: requestedUserId, column }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);

    if (column === "inbox") {
      const [tasks, notebooks] = await Promise.all([
        ctx.db
          .query("tasks")
          .withIndex("by_user_status", (q) =>
            q.eq("userId", userId).eq("status", "inbox"),
          )
          .take(BOARD_QUERY_LIMIT),
        ctx.db
          .query("notebooks")
          .withIndex("by_user_status", (q) =>
            q.eq("userId", userId).eq("status", "inbox"),
          )
          .take(BOARD_QUERY_LIMIT),
      ]);
      return mergeUnifiedSorted(
        tasks.filter((row) => row.deletedAt === null),
        notebooks.filter((row) => row.deletedAt === null),
      );
    }

    if (column === "today") {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", userId).eq("status", "pending"),
        )
        .take(BOARD_QUERY_LIMIT);
      return mergeUnifiedSorted(
        tasks.filter((row) => row.deletedAt === null),
        [],
      );
    }

    const notebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "pending"),
      )
      .take(BOARD_QUERY_LIMIT);
    return mergeUnifiedSorted(
      [],
      notebooks.filter((row) => row.deletedAt === null),
    );
  },
});

/** Archive / completed buckets — loaded only when those views open. */
export const listBoardSecondary = query({
  args: {
    userId: v.id("users"),
    bucket: v.union(
      v.literal("inbox_archive"),
      v.literal("notes_archive"),
      v.literal("completed"),
    ),
  },
  returns: v.array(unifiedItemValidator),
  handler: async (ctx, { userId: requestedUserId, bucket }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);

    if (bucket === "inbox_archive") {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", userId).eq("status", "snoozed_archive"),
        )
        .take(BOARD_QUERY_LIMIT);
      return mergeUnifiedSorted(
        tasks.filter((row) => row.deletedAt === null),
        [],
      );
    }

    if (bucket === "notes_archive") {
      const notebooks = await ctx.db
        .query("notebooks")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", userId).eq("status", "archived"),
        )
        .take(BOARD_QUERY_LIMIT);
      return mergeUnifiedSorted(
        [],
        notebooks.filter((row) => row.deletedAt === null),
      );
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "completed"),
      )
      .take(BOARD_QUERY_LIMIT);
    return mergeUnifiedSorted(
      tasks.filter((row) => row.deletedAt === null),
      [],
    );
  },
});

/** Unified inbox board — merges tasks + notebooks for Web/Mobile. */
export const listActive = query({
  args: { userId: v.id("users") },
  returns: v.array(unifiedItemValidator),
  handler: async (ctx, { userId: requestedUserId }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
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

    return mergeUnifiedSorted(tasks, notebooks);
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
  lastInteractedAt: v.optional(v.number()),
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
  // IDs encode their table — never cast across tables (db.get would return the
  // other kind and toggleActionable would take the wrong branch / throw).
  const taskId = ctx.db.normalizeId("tasks", itemId);
  if (taskId) {
    const task = await ctx.db.get(taskId);
    if (task && task.userId === userId) {
      return { kind: "task", doc: task };
    }
  }

  const notebookId = ctx.db.normalizeId("notebooks", itemId);
  if (notebookId) {
    const notebook = await ctx.db.get(notebookId);
    if (notebook && notebook.userId === userId) {
      return { kind: "notebook", doc: notebook };
    }
  }

  return null;
}

export const update = mutation({
  args: {
    userId: v.id("users"),
    itemId: v.string(),
    patch: itemPatch,
  },
  handler: async (ctx, { userId: requestedUserId, itemId, patch }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const owned = await loadOwnedItem(ctx, userId, itemId);
    if (!owned) throw new Error("Item not found");

    if (patch.isActionable !== undefined && patch.isActionable !== (owned.kind === "task")) {
      throw new Error("Use toggleActionable to convert between task and note");
    }

    const now = Date.now();

    if (owned.kind === "task") {
      const beforeTags = owned.doc.tags;
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

      const mergedDue =
        patch.dueDate !== undefined ? patch.dueDate : owned.doc.dueDate;
      const mergedMeta =
        patch.metadata !== undefined ? patch.metadata : owned.doc.metadata;
      const mergedDeleted =
        patch.deletedAt !== undefined ? patch.deletedAt : owned.doc.deletedAt;
      const mergedStatus =
        patch.status !== undefined
          ? (patch.status as Doc<"tasks">["status"])
          : owned.doc.status;
      taskPatch.notifyAt = notifyAtPatchValue(
        { isTask: true, dueDate: mergedDue, metadata: mergedMeta },
        typeof mergedDeleted === "number" || !isActiveTaskStatus(mergedStatus),
      );

      await ctx.db.patch(owned.doc._id, taskPatch);
      const updatedTask = await ctx.db.get(owned.doc._id);
      if (updatedTask) {
        await syncTaskToListItems(ctx, updatedTask);
        if (patch.tags !== undefined) {
          await recordTagCorrection(ctx, {
            userId,
            itemId: String(owned.doc._id),
            sourceText:
              owned.doc.sourceRawText ??
              `${owned.doc.title} ${owned.doc.content}`,
            beforeTags,
            afterTags: patch.tags,
            metadata: owned.doc.metadata,
          });
        }
      }
      if (
        typeof patch.deletedAt === "number" &&
        owned.doc.deletedAt == null
      ) {
        const messageId =
          readWhatsappMessageId(patch.metadata) ??
          readWhatsappMessageId(owned.doc.metadata);
        if (messageId) {
          await ensureWhatsappIngestReceipt(ctx, {
            userId,
            messageId,
            reason: "deleted",
          });
        }
      }
      return itemId;
    }

    const beforeTags = owned.doc.tags;
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
    if (patch.dueDate !== undefined) notebookPatch.dueDate = patch.dueDate;

    if (patch.status !== undefined) {
      if (patch.status === "snoozed_archive") {
        notebookPatch.status = "archived";
      } else if (patch.status === "inbox") {
        notebookPatch.status = "inbox";
      } else {
        notebookPatch.status = "pending";
      }
    }

    const mergedNotebookDue =
      patch.dueDate !== undefined ? patch.dueDate : owned.doc.dueDate;
    const mergedNotebookMeta =
      patch.metadata !== undefined ? patch.metadata : owned.doc.metadata;
    const mergedNotebookDeleted =
      patch.deletedAt !== undefined ? patch.deletedAt : owned.doc.deletedAt;
    const mergedNotebookStatus =
      (notebookPatch.status as Doc<"notebooks">["status"] | undefined) ??
      owned.doc.status;
    notebookPatch.notifyAt = notifyAtPatchValue(
      { isTask: false, dueDate: mergedNotebookDue, metadata: mergedNotebookMeta },
      typeof mergedNotebookDeleted === "number" ||
        !isActiveNotebookStatus(mergedNotebookStatus),
    );

    await ctx.db.patch(owned.doc._id, notebookPatch);
    if (patch.tags !== undefined) {
      await recordTagCorrection(ctx, {
        userId,
        itemId: String(owned.doc._id),
        sourceText:
          owned.doc.rawText ?? `${owned.doc.title} ${owned.doc.content}`,
        beforeTags,
        afterTags: patch.tags,
        metadata: owned.doc.metadata,
      });
    }
    if (
      typeof patch.deletedAt === "number" &&
      owned.doc.deletedAt == null
    ) {
      const messageId =
        readWhatsappMessageId(patch.metadata) ??
        readWhatsappMessageId(owned.doc.metadata);
      if (messageId) {
        await ensureWhatsappIngestReceipt(ctx, {
          userId,
          messageId,
          reason: "deleted",
        });
      }
    }
    return itemId;
  },
});

async function recordTagCorrection(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    itemId: string;
    sourceText: string;
    beforeTags: string[];
    afterTags: string[];
    metadata: unknown;
  },
) {
  const beforeFromParse = readParsedTags(args.metadata) ?? args.beforeTags;
  await ctx.scheduler.runAfter(0, internal.ingestLessons.recordCorrection, {
    userId: args.userId,
    sourceText: args.sourceText,
    beforeTags: beforeFromParse,
    afterTags: args.afterTags,
    sourceItemId: args.itemId,
  });
}

function readParsedTags(metadata: unknown): string[] | null {
  if (!metadata || typeof metadata !== "object") return null;
  const parsed = (metadata as { parsed_item?: { tags?: unknown } }).parsed_item;
  if (!parsed || !Array.isArray(parsed.tags)) return null;
  return parsed.tags.filter((tag): tag is string => typeof tag === "string");
}

/**
 * Flip task ↔ note.
 * Inbox stays inbox (color/type only). Pending items move with type
 * (task → today board, note → notes board).
 */
function notebookStatusForTask(status: Doc<"tasks">["status"]): Doc<"notebooks">["status"] {
  if (status === "snoozed_archive") return "archived";
  if (status === "inbox") return "inbox";
  return "pending";
}

function taskStatusForNotebook(status: Doc<"notebooks">["status"]): Doc<"tasks">["status"] {
  if (status === "archived") return "snoozed_archive";
  if (status === "inbox") return "inbox";
  return "pending";
}

function metadataWithoutBoardPin(metadata: unknown): Record<string, unknown> {
  const meta =
    metadata && typeof metadata === "object"
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  delete meta.board_column;
  return meta;
}

export const toggleActionable = mutation({
  args: {
    userId: v.id("users"),
    itemId: v.string(),
    dueDate: v.optional(v.union(v.string(), v.null())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, { userId: requestedUserId, itemId, dueDate, metadata }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const owned = await loadOwnedItem(ctx, userId, itemId);
    if (!owned) throw new Error("Item not found");

    const now = Date.now();

    if (owned.kind === "task") {
      const task = owned.doc;
      const manualReminder = getReminderFlags(task.metadata).manual;
      const meta = metadataWithoutBoardPin(task.metadata);
      const notebookId = await ctx.db.insert("notebooks", {
        userId,
        legacyId: task.legacyId,
        title: task.title,
        content: task.content,
        rawText: task.sourceRawText ?? task.content,
        correctedText: null,
        status: notebookStatusForTask(task.status),
        tags: task.tags,
        metadata: meta,
        dueDate: manualReminder ? task.dueDate : null,
        notifyAt: notifyAtPatchValue(
          {
            isTask: false,
            dueDate: manualReminder ? task.dueDate : null,
            metadata: meta,
          },
          !isActiveNotebookStatus(notebookStatusForTask(task.status)),
        ),
        sourceType: task.sourceType ?? "whatsapp_text",
        storageUrl: task.sourceStorageUrl ?? null,
        sourceStorageId: task.sourceStorageId,
        sortOrder: task.sortOrder,
        lastInteractedAt: now,
        createdAt: task.createdAt,
        updatedAt: now,
        deletedAt: null,
      });
      await softDeleteListItemsForTask(ctx, task._id);
      await ctx.db.delete(task._id);
      return notebookId;
    }

    const notebook = owned.doc;
    const baseMeta = metadataWithoutBoardPin(notebook.metadata);
    const mergedMeta =
      metadata && typeof metadata === "object"
        ? metadataWithoutBoardPin({ ...baseMeta, ...(metadata as Record<string, unknown>) })
        : baseMeta;
    const taskDue = dueDate ?? notebook.dueDate ?? null;
    const taskId = await ctx.db.insert("tasks", {
      userId,
      legacyId: notebook.legacyId,
      title: notebook.title,
      content: notebook.content,
      status: taskStatusForNotebook(notebook.status),
      dueDate: taskDue,
      completedAt: null,
      calendarEventId: null,
      tags: notebook.tags,
      metadata: mergedMeta,
      notifyAt: notifyAtPatchValue(
        {
          isTask: true,
          dueDate: taskDue,
          metadata: mergedMeta,
        },
        !isActiveTaskStatus(taskStatusForNotebook(notebook.status)),
      ),
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

/** Resolve signed URL for stored source media owned by the authenticated user. */
export const getStorageUrl = query({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { userId: requestedUserId, storageId }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);

    const [taskOwner, notebookOwner] = await Promise.all([
      ctx.db
        .query("tasks")
        .withIndex("by_source_storage", (q) =>
          q.eq("sourceStorageId", storageId),
        )
        .first(),
      ctx.db
        .query("notebooks")
        .withIndex("by_source_storage", (q) =>
          q.eq("sourceStorageId", storageId),
        )
        .first(),
    ]);

    const ownsFile =
      (taskOwner?.userId === userId) || (notebookOwner?.userId === userId);

    if (!ownsFile) {
      throw new Error("Unauthorized");
    }

    return await ctx.storage.getUrl(storageId);
  },
});

/** Paginated migration: populate denormalized notifyAt for reminder cron index. */
export const backfillNotifyAt = internalMutation({
  args: {
    phase: v.optional(v.union(v.literal("tasks"), v.literal("notebooks"))),
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    patched: v.number(),
    scheduled: v.boolean(),
    phase: v.union(v.literal("tasks"), v.literal("notebooks")),
  }),
  handler: async (ctx, args) => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 200, 1), 500);
    const phase = args.phase ?? "tasks";
    let patched = 0;

    if (phase === "tasks") {
      const page = await ctx.db.query("tasks").paginate({
        numItems: batchSize,
        cursor: args.cursor ?? null,
      });

      for (const task of page.page) {
        const next = notifyAtPatchValue(
          { isTask: true, dueDate: task.dueDate, metadata: task.metadata },
        task.deletedAt !== null || !isActiveTaskStatus(task.status),
        );
        if (task.notifyAt !== next) {
          await ctx.db.patch(task._id, { notifyAt: next });
          patched += 1;
        }
      }

      if (!page.isDone) {
        await ctx.scheduler.runAfter(0, internal.items.backfillNotifyAt, {
          phase: "tasks",
          cursor: page.continueCursor,
          batchSize,
        });
        return { patched, scheduled: true, phase: "tasks" as const };
      }

      await ctx.scheduler.runAfter(0, internal.items.backfillNotifyAt, {
        phase: "notebooks",
        batchSize,
      });
      return { patched, scheduled: true, phase: "tasks" as const };
    }

    const page = await ctx.db.query("notebooks").paginate({
      numItems: batchSize,
      cursor: args.cursor ?? null,
    });

    for (const notebook of page.page) {
      const next = notifyAtPatchValue(
        {
          isTask: false,
          dueDate: notebook.dueDate ?? null,
          metadata: notebook.metadata,
        },
        notebook.deletedAt !== null || !isActiveNotebookStatus(notebook.status),
      );
      if (notebook.notifyAt !== next) {
        await ctx.db.patch(notebook._id, { notifyAt: next });
        patched += 1;
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.items.backfillNotifyAt, {
        phase: "notebooks",
        cursor: page.continueCursor,
        batchSize,
      });
      return { patched, scheduled: true, phase: "notebooks" as const };
    }

    return { patched, scheduled: false, phase: "notebooks" as const };
  },
});

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const trashItemValidator = v.object({
  id: v.string(),
  title: v.string(),
  content: v.string(),
  deletedAt: v.number(),
  isActionable: v.boolean(),
  status: v.string(),
});

const PRE_DELETE_STATUS = "pre_delete_status";
const PRE_DELETE_COMPLETED_AT = "pre_delete_completed_at";

function readMetaString(metadata: unknown, key: string): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function metadataWithoutDeleteKeys(metadata: unknown): Record<string, unknown> {
  const meta =
    metadata && typeof metadata === "object"
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  delete meta[PRE_DELETE_STATUS];
  delete meta[PRE_DELETE_COMPLETED_AT];
  return meta;
}

/** Soft-deleted items still within the retention window. */
export const listTrash = query({
  args: {
    userId: v.id("users"),
    nowMs: v.number(),
  },
  returns: v.array(trashItemValidator),
  handler: async (ctx, { userId: requestedUserId, nowMs }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const cutoff = nowMs - TRASH_RETENTION_MS;

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_deleted", (q) =>
        q.eq("userId", userId).gt("deletedAt", 0),
      )
      .take(300);
    const notebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user_deleted", (q) =>
        q.eq("userId", userId).gt("deletedAt", 0),
      )
      .take(300);

    const items: Array<{
      id: string;
      title: string;
      content: string;
      deletedAt: number;
      isActionable: boolean;
      status: string;
    }> = [];

    for (const task of tasks) {
      if (task.deletedAt == null || task.deletedAt < cutoff) continue;
      items.push({
        id: String(task._id),
        title: task.title,
        content: task.content,
        deletedAt: task.deletedAt,
        isActionable: true,
        status: task.status,
      });
    }
    for (const notebook of notebooks) {
      if (notebook.deletedAt == null || notebook.deletedAt < cutoff) continue;
      items.push({
        id: String(notebook._id),
        title: notebook.title,
        content: notebook.content,
        deletedAt: notebook.deletedAt,
        isActionable: false,
        status:
          notebook.status === "archived" ? "snoozed_archive" : notebook.status,
      });
    }

    items.sort((a, b) => b.deletedAt - a.deletedAt);
    return items;
  },
});

/** Restore one or more trash items to the board. */
export const restoreFromTrash = mutation({
  args: {
    userId: v.id("users"),
    itemIds: v.array(v.string()),
  },
  returns: v.object({ restored: v.number() }),
  handler: async (ctx, { userId: requestedUserId, itemIds }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const now = Date.now();
    let restored = 0;
    const uniqueIds = [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];

    for (const itemId of uniqueIds.slice(0, 100)) {
      const owned = await loadOwnedItem(ctx, userId, itemId);
      if (!owned || owned.doc.deletedAt == null) continue;

      const meta = metadataWithoutDeleteKeys(owned.doc.metadata);
      const savedStatus = readMetaString(owned.doc.metadata, PRE_DELETE_STATUS);
      const savedCompleted = readMetaString(
        owned.doc.metadata,
        PRE_DELETE_COMPLETED_AT,
      );

      if (owned.kind === "task") {
        const status =
          savedStatus === "inbox" ||
          savedStatus === "pending" ||
          savedStatus === "completed" ||
          savedStatus === "snoozed_archive"
            ? (savedStatus as Doc<"tasks">["status"])
            : "inbox";
        const completedAt =
          status === "completed" && savedCompleted ? savedCompleted : null;
        await ctx.db.patch(owned.doc._id, {
          deletedAt: null,
          status,
          completedAt,
          metadata: meta,
          lastInteractedAt: now,
          updatedAt: now,
          notifyAt: notifyAtPatchValue(
            { isTask: true, dueDate: owned.doc.dueDate, metadata: meta },
            !isActiveTaskStatus(status),
          ),
        });
        const updated = await ctx.db.get(owned.doc._id);
        if (updated) await syncTaskToListItems(ctx, updated);
      } else {
        const status =
          savedStatus === "inbox" || savedStatus === "pending"
            ? (savedStatus as Doc<"notebooks">["status"])
            : savedStatus === "snoozed_archive"
              ? "archived"
              : "inbox";
        await ctx.db.patch(owned.doc._id, {
          deletedAt: null,
          status,
          metadata: meta,
          lastInteractedAt: now,
          updatedAt: now,
          notifyAt: notifyAtPatchValue(
            {
              isTask: false,
              dueDate: owned.doc.dueDate ?? null,
              metadata: meta,
            },
            !isActiveNotebookStatus(status),
          ),
        });
      }
      restored += 1;
    }

    return { restored };
  },
});

/** Permanently delete trash items (must already be soft-deleted). */
export const permanentlyDeleteFromTrash = mutation({
  args: {
    userId: v.id("users"),
    itemIds: v.array(v.string()),
  },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { userId: requestedUserId, itemIds }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    let deleted = 0;
    const uniqueIds = [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];

    for (const itemId of uniqueIds.slice(0, 100)) {
      const owned = await loadOwnedItem(ctx, userId, itemId);
      if (!owned || owned.doc.deletedAt == null) continue;

      if (owned.kind === "task") {
        await softDeleteListItemsForTask(ctx, owned.doc._id);
        const listItems = await ctx.db
          .query("taskListItems")
          .withIndex("by_source_task", (q) => q.eq("sourceTaskId", owned.doc._id))
          .collect();
        for (const listItem of listItems) {
          await ctx.db.delete(listItem._id);
        }
        await ctx.db.delete(owned.doc._id);
      } else {
        await ctx.db.delete(owned.doc._id);
      }
      deleted += 1;
    }

    return { deleted };
  },
});
