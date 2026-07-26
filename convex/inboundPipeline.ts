"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";
import { applyHebrewAsrSpellingFixes } from "./lib/ingest/hebrewAsrSpelling";
import { enrichParsedItemsWithAnalysis } from "./lib/ingest/itemAnalysis";
import { parseInputLocally } from "./lib/ingest/localParse";
import { markSenderMessageRead } from "./lib/replyToSender";
import { resolveGreenApiMediaUrl } from "./lib/greenApiDownload";
import type { SourceType } from "./validators";
import { parseInputForIngest, sanitizeInboundText } from "./openaiPipeline";

const DEFAULT_TIMEZONE = "Asia/Jerusalem";

type InboundProcessResult = {
  ok: boolean;
  reason: string;
  sourceType?: SourceType;
  transcription?: string;
  rawTranscription?: string;
  correctedTranscription?: string;
  durationSeconds?: number;
  createdCount?: number;
};

type CreatedRef = {
  kind: "task" | "notebook";
  id: Id<"tasks"> | Id<"notebooks">;
};

function toSaveItems(
  enriched: ReturnType<typeof enrichParsedItemsWithAnalysis>,
) {
  return enriched.map((item) => ({
    title: item.title,
    content: item.content,
    isActionable: item.is_actionable,
    dueDate: item.is_actionable ? item.due_date : null,
    tags: item.tags,
    metadata: {
      analysis: item.analysis,
      parsed_item: {
        title: item.title,
        content: item.content,
        is_actionable: item.is_actionable,
        due_date: item.due_date,
        tags: item.tags,
        analysis: item.analysis,
      },
    },
  }));
}

/**
 * Instant path: sync spelling fixes + local parse → DB write (UI updates live).
 * AI proofread/parse runs in the background and patches the same rows.
 */
async function ingestExtractedText(
  ctx: ActionCtx,
  params: {
    userId: Id<"users">;
    messageId: string;
    text: string;
    sourceType: SourceType;
    sourceRawText?: string;
    sourceStorageUrl?: string | null;
    extraMetadata?: Record<string, unknown>;
    senderPhone?: string;
    chatId?: string;
  },
): Promise<{ createdCount: number }> {
  const timezone = DEFAULT_TIMEZONE;
  const referenceDate = new Date();

  const sanitized = sanitizeInboundText(params.text);
  if (!sanitized.accepted) {
    throw new Error("empty_or_junk_text");
  }

  await ctx.runMutation(internal.userTagDefinitions.ensureDefaults, {
    userId: params.userId,
  });
  const allowedTags = await ctx.runQuery(internal.userTagDefinitions.listNamesInternal, {
    userId: params.userId,
  });
  const lessons = await ctx.runQuery(internal.ingestLessons.listForUserInternal, {
    userId: params.userId,
  });

  const syncText = applyHebrewAsrSpellingFixes(sanitized.text);
  const localParsed = parseInputLocally({
    text: syncText,
    timezone,
    locale: "he-IL",
    referenceDate,
    allowedTags,
    lessons,
  });

  const enriched = enrichParsedItemsWithAnalysis(localParsed.items, {
    sourceType: params.sourceType,
    sourceText: syncText,
    timezone,
    referenceDate,
  });

  const correctedFromMeta =
    typeof params.extraMetadata?.corrected_transcription === "string"
      ? params.extraMetadata.corrected_transcription
      : null;

  const result = await ctx.runMutation(internal.ingest.saveParsedItems, {
    userId: params.userId,
    sourceType: params.sourceType,
    sourceRawText: params.sourceRawText ?? sanitized.text,
    sourceCorrectedText: correctedFromMeta ?? syncText,
    sourceStorageUrl: params.sourceStorageUrl ?? null,
    whatsappMessageId: params.messageId,
    sourceMetadata: {
      ...(params.extraMetadata ?? {}),
      parse_response: localParsed,
      parse_path: "local_fast",
      whatsapp_chat_id: params.chatId,
    },
    items: toSaveItems(enriched),
  });

  if (result.created.length > 0) {
    await ctx.scheduler.runAfter(0, internal.inboundPipeline.refineIngestedText, {
      userId: params.userId,
      messageId: params.messageId,
      text: syncText,
      sourceType: params.sourceType,
      created: result.created,
      chatId: params.chatId,
    });
  }

  // No confirmation text — only mark the WhatsApp message as read (double ticks).
  await markSenderMessageRead(ctx, {
    chatId: params.chatId,
    messageId: params.messageId,
  });

  return result;
}

export const processGreenApiMessage = internalAction({
  args: {
    userId: v.id("users"),
    messageId: v.string(),
    senderPhone: v.string(),
    chatId: v.optional(v.string()),
    messageType: v.string(),
    text: v.optional(v.string()),
    audioUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<InboundProcessResult> => {
    const TERMINAL_SKIP = new Set([
      "empty_or_junk_text",
      "unsupported_message_type",
      "unsupported_media",
      "vision_ocr_not_configured",
    ]);

    async function finish(result: InboundProcessResult): Promise<InboundProcessResult> {
      const reason = result.reason ?? "";
      // Do NOT tombstone missing media / quota / OCR — yellowCard + billing
      // recoveries must be able to reprocess text/voice/image from history.
      const terminal = !result.ok && TERMINAL_SKIP.has(reason);
      if (terminal) {
        await ctx.runMutation(internal.ingest.recordWhatsappSkip, {
          userId: args.userId as Id<"users">,
          messageId: args.messageId,
        });
      }
      return result;
    }

    if (args.messageType === "audio") {
      const audioUrl =
        args.audioUrl?.trim() ||
        (await resolveGreenApiMediaUrl({
          chatId: args.chatId,
          messageId: args.messageId,
        }));
      if (!audioUrl) {
        return await finish({ ok: false, reason: "missing_audio_url" });
      }

      const voice = await ctx.runAction(internal.voicePipeline.processVoiceMessage, {
        userId: args.userId as Id<"users">,
        messageId: args.messageId,
        audioUrl,
        senderPhone: args.senderPhone,
        chatId: args.chatId,
        mimeType: args.mimeType,
      });

      return await finish({
        ok: voice.ok,
        reason: voice.reason,
        sourceType: "whatsapp_voice",
        transcription: voice.transcription,
        durationSeconds: voice.durationSeconds,
        createdCount: voice.createdCount,
      });
    }

    if (args.messageType === "image") {
      const imageUrl =
        args.imageUrl?.trim() ||
        (await resolveGreenApiMediaUrl({
          downloadUrl: args.imageUrl,
          chatId: args.chatId,
          messageId: args.messageId,
        }));
      const vision = await ctx.runAction(internal.visionPipeline.processNotebookImage, {
        userId: args.userId as Id<"users">,
        messageId: args.messageId,
        imageUrl: imageUrl ?? undefined,
        senderPhone: args.senderPhone,
        chatId: args.chatId,
        mimeType: args.mimeType,
        caption: args.text,
      });

      return await finish({
        ok: vision.ok,
        reason: vision.reason,
        sourceType: "image",
        transcription: vision.correctedTranscription,
        rawTranscription: vision.rawTranscription,
        correctedTranscription: vision.correctedTranscription,
        createdCount: vision.createdCount,
      });
    }

    if (args.messageType === "text") {
      const extractedText = args.text?.trim() ?? "";

      try {
        const result = await ingestExtractedText(ctx, {
          userId: args.userId as Id<"users">,
          messageId: args.messageId,
          text: extractedText,
          sourceType: "whatsapp_text",
          senderPhone: args.senderPhone,
          chatId: args.chatId,
        });

        return {
          ok: true,
          reason: "ingested",
          sourceType: "whatsapp_text",
          createdCount: result.createdCount,
        };
      } catch (error) {
        if (error instanceof Error && error.message === "empty_or_junk_text") {
          return await finish({ ok: false, reason: "empty_or_junk_text" });
        }
        throw error;
      }
    }

    return await finish({ ok: false, reason: "unsupported_message_type" });
  },
});

/**
 * Background AI polish after the local-fast save. Patches the rows already
 * visible in the UI — never blocks first paint.
 */
export const refineIngestedText = internalAction({
  args: {
    userId: v.id("users"),
    messageId: v.string(),
    text: v.string(),
    sourceType: v.union(
      v.literal("whatsapp_text"),
      v.literal("whatsapp_voice"),
      v.literal("notebook_ocr"),
      v.literal("typed_text"),
      v.literal("image"),
      v.literal("document"),
    ),
    created: v.array(
      v.object({
        kind: v.union(v.literal("task"), v.literal("notebook")),
        id: v.union(v.id("tasks"), v.id("notebooks")),
      }),
    ),
    chatId: v.optional(v.string()),
  },
  returns: v.object({
    refined: v.boolean(),
    patched: v.number(),
  }),
  handler: async (ctx, args): Promise<{ refined: boolean; patched: number }> => {
    if (args.created.length === 0) {
      return { refined: false, patched: 0 };
    }

    const timezone = DEFAULT_TIMEZONE;
    const referenceDate = new Date();
    const allowedTags = await ctx.runQuery(internal.userTagDefinitions.listNamesInternal, {
      userId: args.userId,
    });
    const lessons = await ctx.runQuery(internal.ingestLessons.listForUserInternal, {
      userId: args.userId,
    });

    const parsed = await parseInputForIngest({
      text: args.text,
      timezone,
      locale: "he-IL",
      referenceDate,
      allowedTags,
      lessons,
      alreadyNormalized: true,
    });

    const enriched = enrichParsedItemsWithAnalysis(parsed.items, {
      sourceType: args.sourceType,
      sourceText: args.text,
      timezone,
      referenceDate,
    });

    const patched = await ctx.runMutation(internal.ingest.applyRefinedParse, {
      userId: args.userId,
      created: args.created as CreatedRef[],
      items: toSaveItems(enriched),
      sourceText: args.text,
      parsePath: "ai_refine",
    });

    return { refined: true, patched };
  },
});
