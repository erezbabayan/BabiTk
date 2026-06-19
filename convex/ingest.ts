import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import type { SourceType } from "./validators";

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
    const created: {
      kind: "task" | "notebook";
      id: Id<"tasks"> | Id<"notebooks">;
    }[] = [];

    for (const item of args.items) {
      const metadata = {
        ...(args.sourceMetadata ?? {}),
        ...(item.metadata ?? {}),
        ...(args.whatsappMessageId
          ? { whatsapp_message_id: args.whatsappMessageId }
          : {}),
      };

      if (item.isActionable) {
        const taskId = await ctx.db.insert("tasks", {
          userId: args.userId,
          title: item.title,
          content: item.content,
          status: "inbox",
          dueDate: item.dueDate,
          completedAt: null,
          calendarEventId: null,
          tags: item.tags,
          metadata,
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
          title: item.title,
          content: item.content || item.title,
          rawText: args.sourceRawText ?? item.content ?? null,
          correctedText: args.sourceCorrectedText ?? null,
          status: "inbox",
          tags: item.tags,
          metadata,
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
