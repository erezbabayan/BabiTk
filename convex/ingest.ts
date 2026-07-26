import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { DEFAULT_TAG_NAMES } from "./lib/ingest/defaultTags";
import { finalizeIngestItem } from "./lib/ingest/finalizeIngestItem";
import { mergeContinuationParsedItems } from "./lib/ingest/inputSegmentation";
import type { ParsedItem } from "./lib/ingest/types";
import {
  ensureWhatsappIngestReceipt,
  findExistingWhatsappItem,
  findLiveWhatsappItem,
  getWhatsappIngestReceipt,
  hasWhatsappIngestReceipt,
  isWhatsappCaptureComplete,
  readWhatsappMessageId,
} from "./lib/whatsappIngestReceipt";
import { notifyAtPatchValue } from "./lib/notifyAt";
import type { SourceType } from "./validators";

export const hasWhatsappReceipt = internalQuery({
  args: {
    userId: v.id("users"),
    messageId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return await hasWhatsappIngestReceipt(ctx, args.userId, args.messageId);
  },
});

/** Receipt reason for backfill gating (cheap — no board scans). */
export const getWhatsappReceiptReason = internalQuery({
  args: {
    userId: v.id("users"),
    messageId: v.string(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const receipt = await getWhatsappIngestReceipt(
      ctx,
      args.userId,
      args.messageId,
    );
    return receipt?.reason ?? null;
  },
});

/** Backfill gate: true = do not reschedule (item exists or deleted tombstone). */
export const isCaptureComplete = internalQuery({
  args: {
    userId: v.id("users"),
    messageId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return await isWhatsappCaptureComplete(ctx, args.userId, args.messageId);
  },
});

/** Ops: drop skipped receipts (cheap) so capture can retry recoverable failures. */
export const clearOrphanWhatsappReceipts = internalMutation({
  args: {
    userId: v.id("users"),
    olderThanMs: v.optional(v.number()),
  },
  returns: v.object({ cleared: v.number() }),
  handler: async (ctx, args) => {
    const cutoff = Date.now() - (args.olderThanMs ?? 0);
    const rows = await ctx.db
      .query("whatsappIngestReceipts")
      .withIndex("by_user_message", (q) => q.eq("userId", args.userId))
      .take(500);
    let cleared = 0;
    for (const row of rows) {
      // Only auto-clear skipped — ingested orphans are recovered via
      // isCaptureComplete + live message-id set (avoids byte-limit scans).
      if (row.reason !== "skipped") continue;
      if (args.olderThanMs !== undefined && row.createdAt > cutoff) continue;
      await ctx.db.delete(row._id);
      cleared += 1;
    }
    return { cleared };
  },
});

/**
 * WhatsApp message ids that must not be re-ingested: live board rows OR
 * soft-deleted rows (user already deleted — never resurrect).
 */
export const listHandledWhatsappMessageIds = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const ids = new Set<string>();
    const liveTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_deleted", (q) =>
        q.eq("userId", args.userId).eq("deletedAt", null),
      )
      .take(300);
    for (const row of liveTasks) {
      const mid = readWhatsappMessageId(row.metadata);
      if (mid) ids.add(mid);
    }
    const liveNotebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user_deleted", (q) =>
        q.eq("userId", args.userId).eq("deletedAt", null),
      )
      .take(300);
    for (const row of liveNotebooks) {
      const mid = readWhatsappMessageId(row.metadata);
      if (mid) ids.add(mid);
    }
    // Soft-deleted — user trash. Blocking these prevents "מידע חדש" resurrection.
    const deletedTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_deleted", (q) =>
        q.eq("userId", args.userId).gt("deletedAt", 0),
      )
      .take(400);
    for (const row of deletedTasks) {
      const mid = readWhatsappMessageId(row.metadata);
      if (mid) ids.add(mid);
    }
    const deletedNotebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user_deleted", (q) =>
        q.eq("userId", args.userId).gt("deletedAt", 0),
      )
      .take(400);
    for (const row of deletedNotebooks) {
      const mid = readWhatsappMessageId(row.metadata);
      if (mid) ids.add(mid);
    }
    return [...ids];
  },
});

/**
 * Soft-delete live WhatsApp items that already have a soft-deleted twin
 * (resurrected by a bad backfill). Also force deleted receipts.
 */
export const purgeResurrectedWhatsappItems = internalMutation({
  args: {
    userId: v.id("users"),
  },
  returns: v.object({
    softDeleted: v.number(),
    receiptsUpgraded: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const deletedMessageIds = new Set<string>();

    const softTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_deleted", (q) =>
        q.eq("userId", args.userId).gt("deletedAt", 0),
      )
      .take(400);
    for (const row of softTasks) {
      const mid = readWhatsappMessageId(row.metadata);
      if (mid) deletedMessageIds.add(mid);
    }
    const softNotebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user_deleted", (q) =>
        q.eq("userId", args.userId).gt("deletedAt", 0),
      )
      .take(400);
    for (const row of softNotebooks) {
      const mid = readWhatsappMessageId(row.metadata);
      if (mid) deletedMessageIds.add(mid);
    }

    let softDeleted = 0;
    const liveTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_deleted", (q) =>
        q.eq("userId", args.userId).eq("deletedAt", null),
      )
      .take(300);
    for (const row of liveTasks) {
      const mid = readWhatsappMessageId(row.metadata);
      if (!mid || !deletedMessageIds.has(mid)) continue;
      await ctx.db.patch(row._id, { deletedAt: now, updatedAt: now });
      softDeleted += 1;
    }
    const liveNotebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user_deleted", (q) =>
        q.eq("userId", args.userId).eq("deletedAt", null),
      )
      .take(300);
    for (const row of liveNotebooks) {
      const mid = readWhatsappMessageId(row.metadata);
      if (!mid || !deletedMessageIds.has(mid)) continue;
      await ctx.db.patch(row._id, { deletedAt: now, updatedAt: now });
      softDeleted += 1;
    }

    let receiptsUpgraded = 0;
    for (const messageId of deletedMessageIds) {
      const before = await getWhatsappIngestReceipt(ctx, args.userId, messageId);
      await ensureWhatsappIngestReceipt(ctx, {
        userId: args.userId,
        messageId,
        reason: "deleted",
      });
      if (!before || before.reason !== "deleted") receiptsUpgraded += 1;
    }

    return { softDeleted, receiptsUpgraded };
  },
});
/** Ops: inspect one WhatsApp message → receipt + live/deleted board rows. */
export const debugWhatsappMessage = internalQuery({
  args: {
    userId: v.id("users"),
    messageId: v.string(),
  },
  returns: v.object({
    receiptReason: v.union(v.string(), v.null()),
    liveItem: v.boolean(),
    softDeletedItem: v.boolean(),
    complete: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const receipt = await getWhatsappIngestReceipt(
      ctx,
      args.userId,
      args.messageId,
    );
    const liveItem = await findLiveWhatsappItem(
      ctx,
      args.userId,
      args.messageId,
    );
    const anyItem = await findExistingWhatsappItem(
      ctx,
      args.userId,
      args.messageId,
    );
    return {
      receiptReason: receipt?.reason ?? null,
      liveItem,
      softDeletedItem: anyItem && !liveItem,
      complete: await isWhatsappCaptureComplete(
        ctx,
        args.userId,
        args.messageId,
      ),
    };
  },
});

/** Tombstone a WhatsApp message so capture-backfill stops rescheduling it. */
export const recordWhatsappSkip = internalMutation({
  args: {
    userId: v.id("users"),
    messageId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ensureWhatsappIngestReceipt(ctx, {
      userId: args.userId,
      messageId: args.messageId,
      reason: "skipped",
    });
    return null;
  },
});

/** Remove a single receipt so backfill can reprocess (soft-deleted / orphan). */
export const clearOneWhatsappReceipt = internalMutation({
  args: {
    userId: v.id("users"),
    messageId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const receipt = await getWhatsappIngestReceipt(
      ctx,
      args.userId,
      args.messageId,
    );
    if (!receipt) return false;
    if (receipt.reason === "deleted") return false;
    await ctx.db.delete(receipt._id);
    return true;
  },
});

/** Backfill receipts for soft-deleted WhatsApp items (pre-receipt-table tombstones). */
export const seedReceiptsFromSoftDeleted = internalMutation({
  args: {
    userId: v.id("users"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    let seeded = 0;

    const softDeletedTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_deleted", (q) =>
        q.eq("userId", args.userId).gt("deletedAt", 0),
      )
      .take(500);
    for (const row of softDeletedTasks) {
      const messageId = readWhatsappMessageId(row.metadata);
      if (!messageId) continue;
      const before = await hasWhatsappIngestReceipt(ctx, args.userId, messageId);
      await ensureWhatsappIngestReceipt(ctx, {
        userId: args.userId,
        messageId,
        reason: "deleted",
      });
      if (!before) seeded += 1;
    }

    const softDeletedNotebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_user_deleted", (q) =>
        q.eq("userId", args.userId).gt("deletedAt", 0),
      )
      .take(500);
    for (const row of softDeletedNotebooks) {
      const messageId = readWhatsappMessageId(row.metadata);
      if (!messageId) continue;
      const before = await hasWhatsappIngestReceipt(ctx, args.userId, messageId);
      await ensureWhatsappIngestReceipt(ctx, {
        userId: args.userId,
        messageId,
        reason: "deleted",
      });
      if (!before) seeded += 1;
    }

    return seeded;
  },
});

const ingestItem = v.object({
  title: v.string(),
  content: v.string(),
  isActionable: v.boolean(),
  dueDate: v.union(v.string(), v.null()),
  tags: v.array(v.string()),
  metadata: v.optional(v.any()),
});

export const saveParsedItems = internalMutation({
  args: {
    userId: v.id("users"),
    sourceType: v.union(
      v.literal("whatsapp_text"),
      v.literal("whatsapp_voice"),
      v.literal("notebook_ocr"),
      v.literal("typed_text"),
      v.literal("image"),
      v.literal("document"),
    ),
    sourceRawText: v.optional(v.string()),
    sourceCorrectedText: v.optional(v.union(v.string(), v.null())),
    sourceStorageUrl: v.optional(v.union(v.string(), v.null())),
    sourceStorageId: v.optional(v.id("_storage")),
    whatsappMessageId: v.optional(v.string()),
    sourceMetadata: v.optional(v.any()),
    items: v.array(ingestItem),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const timezone = "Asia/Jerusalem";
    const referenceDate = new Date();
    const created: {
      kind: "task" | "notebook";
      id: Id<"tasks"> | Id<"notebooks">;
    }[] = [];

    const tagRows = await ctx.db
      .query("userTagDefinitions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    tagRows.sort((a, b) => a.sortOrder - b.sortOrder);
    const allowedTags =
      tagRows.length > 0 ? tagRows.map((tag) => tag.name) : DEFAULT_TAG_NAMES;

    const sourceText =
      args.sourceCorrectedText?.trim() ||
      args.sourceRawText?.trim() ||
      undefined;

    const mergedForSave = mergeContinuationParsedItems(
      args.items.map((item) => ({
        title: item.title,
        content: item.content,
        is_actionable: item.isActionable,
        due_date: item.dueDate,
        tags: item.tags,
        analysis: readIngestItemAnalysis(item.metadata),
      })),
      sourceText ?? "",
    );

    const itemsToSave = mergedForSave.map((item, index) => ({
      title: item.title,
      content: item.content || sourceText || item.title,
      isActionable: item.is_actionable,
      dueDate: item.due_date,
      tags: item.tags,
      metadata: {
        ...(args.items[index]?.metadata ?? args.items[0]?.metadata ?? {}),
        analysis: item.analysis,
      },
    }));

    // Durable WhatsApp dedupe: never recreate after ingest / soft-delete / skip.
    if (args.whatsappMessageId) {
      const messageId = args.whatsappMessageId;
      if (await findExistingWhatsappItem(ctx, args.userId, messageId)) {
        const live = await findLiveWhatsappItem(ctx, args.userId, messageId);
        await ensureWhatsappIngestReceipt(ctx, {
          userId: args.userId,
          messageId,
          reason: live ? "duplicate" : "deleted",
        });
        return { createdCount: 0, created: [] };
      }

      const existingReceipt = await getWhatsappIngestReceipt(
        ctx,
        args.userId,
        messageId,
      );
      if (existingReceipt) {
        // Any prior receipt = already handled; do not create again.
        return { createdCount: 0, created: [] };
      }

      await ensureWhatsappIngestReceipt(ctx, {
        userId: args.userId,
        messageId,
        reason: "ingested",
      });
    }

    for (const item of itemsToSave) {
      const finalized = finalizeIngestItem(item, {
        sourceText: sourceText ?? item.content ?? item.title,
        allowedTags,
        timezone,
        referenceDate,
      });

      const metadata = {
        ...(args.sourceMetadata ?? {}),
        ...(finalized.metadata ?? {}),
        ...(args.whatsappMessageId
          ? { whatsapp_message_id: args.whatsappMessageId }
          : {}),
      };

      if (finalized.isActionable) {
        const taskId = await ctx.db.insert("tasks", {
          userId: args.userId,
          title: finalized.title,
          content: finalized.content,
          status: "inbox",
          dueDate: finalized.dueDate,
          completedAt: null,
          calendarEventId: null,
          tags: finalized.tags,
          metadata,
          notifyAt: notifyAtPatchValue({
            isTask: true,
            dueDate: finalized.dueDate,
            metadata,
          }),
          sourceType: args.sourceType as SourceType,
          sourceStorageUrl: args.sourceStorageUrl ?? null,
          sourceStorageId: args.sourceStorageId,
          sourceRawText: args.sourceRawText ?? null,
          sortOrder: now,
          lastInteractedAt: now,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        created.push({ kind: "task", id: taskId });
      } else {
        const notebookId = await ctx.db.insert("notebooks", {
          userId: args.userId,
          title: finalized.title,
          content: finalized.content || finalized.title,
          rawText: args.sourceRawText ?? finalized.content ?? null,
          correctedText: args.sourceCorrectedText ?? null,
          status: "inbox",
          tags: finalized.tags,
          metadata,
          notifyAt: notifyAtPatchValue({
            isTask: false,
            dueDate: finalized.dueDate ?? null,
            metadata,
          }),
          sourceType: args.sourceType as SourceType,
          storageUrl: args.sourceStorageUrl ?? null,
          sourceStorageId: args.sourceStorageId,
          sortOrder: now,
          lastInteractedAt: now,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        created.push({ kind: "notebook", id: notebookId });
        await ctx.scheduler.runAfter(0, internal.embeddingActions.syncNotebook, {
          notebookId,
        });
      }
    }

    return { createdCount: created.length, created };
  },
});

/**
 * Patch rows that were saved via the local-fast path once AI parse finishes.
 * Keeps the UI responsive: users already see the local parse result.
 */
export const applyRefinedParse = internalMutation({
  args: {
    userId: v.id("users"),
    created: v.array(
      v.object({
        kind: v.union(v.literal("task"), v.literal("notebook")),
        id: v.union(v.id("tasks"), v.id("notebooks")),
      }),
    ),
    items: v.array(ingestItem),
    sourceText: v.optional(v.string()),
    parsePath: v.optional(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const timezone = "Asia/Jerusalem";
    const referenceDate = new Date();
    const tagRows = await ctx.db
      .query("userTagDefinitions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    tagRows.sort((a, b) => a.sortOrder - b.sortOrder);
    const allowedTags =
      tagRows.length > 0 ? tagRows.map((tag) => tag.name) : DEFAULT_TAG_NAMES;

    let patched = 0;
    const limit = Math.min(args.created.length, args.items.length);
    for (let i = 0; i < limit; i++) {
      const ref = args.created[i]!;
      const item = args.items[i]!;
      const finalized = finalizeIngestItem(item, {
        sourceText: args.sourceText ?? item.content ?? item.title,
        allowedTags,
        timezone,
        referenceDate,
      });

      if (ref.kind === "task") {
        const task = await ctx.db.get(ref.id as Id<"tasks">);
        if (!task || task.userId !== args.userId || task.deletedAt) continue;
        const metadata = {
          ...(typeof task.metadata === "object" && task.metadata
            ? (task.metadata as Record<string, unknown>)
            : {}),
          ...(finalized.metadata ?? {}),
          parse_path: args.parsePath ?? "ai_refine",
        };
        await ctx.db.patch(ref.id as Id<"tasks">, {
          title: finalized.title,
          content: finalized.content,
          dueDate: finalized.dueDate,
          tags: finalized.tags,
          metadata,
          notifyAt: notifyAtPatchValue({
            isTask: true,
            dueDate: finalized.dueDate,
            metadata,
          }),
          updatedAt: now,
        });
        patched += 1;
      } else {
        const notebook = await ctx.db.get(ref.id as Id<"notebooks">);
        if (!notebook || notebook.userId !== args.userId || notebook.deletedAt) {
          continue;
        }
        const metadata = {
          ...(typeof notebook.metadata === "object" && notebook.metadata
            ? (notebook.metadata as Record<string, unknown>)
            : {}),
          ...(finalized.metadata ?? {}),
          parse_path: args.parsePath ?? "ai_refine",
        };
        await ctx.db.patch(ref.id as Id<"notebooks">, {
          title: finalized.title,
          content: finalized.content || finalized.title,
          correctedText: args.sourceText ?? notebook.correctedText ?? null,
          tags: finalized.tags,
          metadata,
          notifyAt: notifyAtPatchValue({
            isTask: false,
            dueDate: finalized.dueDate ?? null,
            metadata,
          }),
          updatedAt: now,
        });
        patched += 1;
        await ctx.scheduler.runAfter(0, internal.embeddingActions.syncNotebook, {
          notebookId: ref.id as Id<"notebooks">,
        });
      }
    }
    return patched;
  },
});

function readIngestItemAnalysis(
  metadata?: Record<string, unknown>,
): ParsedItem["analysis"] {
  const raw = metadata?.analysis;
  if (!raw || typeof raw !== "object") {
    return {
      goal: "חסר",
      data_points: "חסר",
      task: "חסר",
      urgency: "חסר",
      time_mention: "חסר",
    };
  }
  const a = raw as Record<string, unknown>;
  return {
    goal: typeof a.goal === "string" ? a.goal : "חסר",
    data_points: typeof a.data_points === "string" ? a.data_points : "חסר",
    task: typeof a.task === "string" ? a.task : "חסר",
    urgency:
      a.urgency === "גבוהה" ||
      a.urgency === "בינונית" ||
      a.urgency === "נמוכה" ||
      a.urgency === "חסר"
        ? a.urgency
        : "חסר",
    time_mention: typeof a.time_mention === "string" ? a.time_mention : "חסר",
  };
}
