"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";
import { resolveGreenApiMediaUrl } from "./lib/greenApiDownload";
import type { GreenApiCredentials } from "./lib/greenApiSend";
import { enrichParsedItemsWithAnalysis } from "./lib/ingest/itemAnalysis";
import { isVisionOcrConfigured } from "./lib/imageVision";
import { storeMediaBuffer } from "./lib/mediaStorage";
import { markSenderMessageRead } from "./lib/replyToSender";
import type { ParseInputResponse } from "./lib/ingest/types";
import {
  downloadMedia,
  parseInputForIngest,
  refineNotebookTranscription,
  sanitizeInboundText,
  transcribeNotebookImageVision,
} from "./openaiPipeline";

const DEFAULT_TIMEZONE = "Asia/Jerusalem";

export type VisionPipelineResult = {
  ok: boolean;
  reason: string;
  rawTranscription?: string;
  correctedTranscription?: string;
  parseResponse?: ParseInputResponse;
  createdCount?: number;
  engine?: string;
};

function looksLikeImageDocument(mimeType?: string, fileName?: string): boolean {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = (fileName ?? "").toLowerCase();
  return /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(name);
}

export const processNotebookImage = internalAction({
  args: {
    userId: v.id("users"),
    messageId: v.string(),
    imageUrl: v.optional(v.string()),
    senderPhone: v.optional(v.string()),
    chatId: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    caption: v.optional(v.string()),
    fileName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<VisionPipelineResult> => {
    if (!isVisionOcrConfigured()) {
      return { ok: false, reason: "vision_ocr_not_configured" };
    }

    const creds: GreenApiCredentials | null = await ctx.runQuery(
      internal.whatsappConfig.getGreenApiCredentialsInternal,
      {},
    );

    const resolvedUrl = await resolveGreenApiMediaUrl({
      downloadUrl: args.imageUrl,
      chatId: args.chatId,
      messageId: args.messageId,
      credentials: creds,
    });

    if (!resolvedUrl) {
      // Caption-only capture (photo failed to download but text was attached).
      const captionOnly = args.caption?.trim() ?? "";
      if (captionOnly.length >= 2) {
        return await ingestPlainText(ctx, {
          userId: args.userId,
          messageId: args.messageId,
          text: captionOnly,
          chatId: args.chatId,
          sourceType: "notebook_ocr",
          sourceRawText: captionOnly,
        });
      }
      return { ok: false, reason: "missing_image_url" };
    }

    let buffer: Buffer;
    let downloadedMime: string;
    try {
      const downloaded = await downloadMedia(resolvedUrl);
      buffer = downloaded.buffer;
      downloadedMime = downloaded.mimeType;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const captionOnly = args.caption?.trim() ?? "";
      if (captionOnly.length >= 2) {
        return await ingestPlainText(ctx, {
          userId: args.userId,
          messageId: args.messageId,
          text: captionOnly,
          chatId: args.chatId,
          sourceType: "notebook_ocr",
          sourceRawText: captionOnly,
        });
      }
      return { ok: false, reason: `image_download_failed:${detail}` };
    }

    const mimeType =
      args.mimeType && looksLikeImageDocument(args.mimeType, args.fileName)
        ? args.mimeType
        : downloadedMime;

    let rawTranscription = "";
    let engine = "none";
    try {
      const vision = await transcribeNotebookImageVision(buffer, mimeType);
      rawTranscription = vision.rawTranscription.trim();
      engine = vision.engine ?? "unknown";
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const captionOnly = args.caption?.trim() ?? "";
      if (captionOnly.length >= 2) {
        return await ingestPlainText(ctx, {
          userId: args.userId,
          messageId: args.messageId,
          text: captionOnly,
          chatId: args.chatId,
          sourceType: "notebook_ocr",
          sourceRawText: captionOnly,
          sourceStorageUrl: resolvedUrl,
        });
      }
      // OCR providers down (quota / model) — still capture the photo so WhatsApp
      // backfill does not loop forever and the user keeps the media in the board.
      const storageId = await storeMediaBuffer(ctx, buffer, mimeType);
      const placeholder =
        "תמונה מוואטסאפ נשמרה. זיהוי טקסט (OCR) נכשל זמנית — אפשר לערוך ידנית.";
      const saved = await ctx.runMutation(internal.ingest.saveParsedItems, {
        userId: args.userId as Id<"users">,
        sourceType: "notebook_ocr",
        sourceRawText: placeholder,
        sourceCorrectedText: placeholder,
        sourceStorageUrl: resolvedUrl,
        sourceStorageId: storageId,
        whatsappMessageId: args.messageId,
        sourceMetadata: {
          raw_transcription: null,
          corrected_transcription: placeholder,
          caption: null,
          image_mime_type: mimeType,
          vision_engine: "none",
          vision_error: detail.slice(0, 500),
          storage_id: storageId,
          whatsapp_chat_id: args.chatId,
          ocr_deferred: true,
        },
        items: [
          {
            title: "תמונה מוואטסאפ",
            content: placeholder,
            isActionable: false,
            dueDate: null,
            tags: [],
            metadata: {
              analysis: null,
              parsed_item: {
                title: "תמונה מוואטסאפ",
                content: placeholder,
                is_actionable: false,
                due_date: null,
                tags: [],
              },
            },
          },
        ],
      });
      return {
        ok: true,
        reason: "ingested_image_without_ocr",
        rawTranscription: "",
        correctedTranscription: placeholder,
        createdCount: saved.createdCount,
        engine: "none",
      };
    }

    const caption = args.caption?.trim() ?? "";
    const combinedRaw = [rawTranscription, caption].filter(Boolean).join("\n").trim();
    if (!combinedRaw) {
      return { ok: false, reason: "empty_or_junk_text", rawTranscription };
    }

    let correctedTranscription = combinedRaw;
    try {
      correctedTranscription = await refineNotebookTranscription(combinedRaw);
    } catch {
      // Parse can proceed on raw OCR when proofread model is unavailable.
      correctedTranscription = combinedRaw;
    }

    const sanitized = sanitizeInboundText(correctedTranscription);
    if (!sanitized.accepted) {
      return { ok: false, reason: "empty_or_junk_text", rawTranscription };
    }

    const storageId = await storeMediaBuffer(ctx, buffer, mimeType);

    await ctx.runMutation(internal.userTagDefinitions.ensureDefaults, {
      userId: args.userId as Id<"users">,
    });
    const allowedTags = await ctx.runQuery(internal.userTagDefinitions.listNamesInternal, {
      userId: args.userId as Id<"users">,
    });
    const lessons = await ctx.runQuery(internal.ingestLessons.listForUserInternal, {
      userId: args.userId as Id<"users">,
    });

    const referenceDate = new Date();
    const parsed = await parseInputForIngest({
      text: sanitized.text,
      timezone: DEFAULT_TIMEZONE,
      locale: "he-IL",
      referenceDate,
      allowedTags,
      lessons,
    });

    const enriched = enrichParsedItemsWithAnalysis(parsed.items, {
      sourceType: "notebook_ocr",
      sourceText: sanitized.text,
      timezone: DEFAULT_TIMEZONE,
      referenceDate,
    });

    const saved = await ctx.runMutation(internal.ingest.saveParsedItems, {
      userId: args.userId as Id<"users">,
      sourceType: "notebook_ocr",
      sourceRawText: combinedRaw,
      sourceCorrectedText: correctedTranscription,
      sourceStorageUrl: resolvedUrl,
      sourceStorageId: storageId,
      whatsappMessageId: args.messageId,
      sourceMetadata: {
        raw_transcription: rawTranscription,
        corrected_transcription: correctedTranscription,
        caption: caption || null,
        image_mime_type: mimeType,
        vision_engine: engine,
        parse_response: parsed,
        storage_id: storageId,
        whatsapp_chat_id: args.chatId,
      },
      items: enriched.map((item) => ({
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
      })),
    });

    await markSenderMessageRead(ctx, {
      chatId: args.chatId,
      messageId: args.messageId,
    });

    return {
      ok: true,
      reason: "ingested",
      rawTranscription,
      correctedTranscription,
      parseResponse: parsed,
      createdCount: saved.createdCount,
      engine,
    };
  },
});

async function ingestPlainText(
  ctx: ActionCtx,
  params: {
    userId: Id<"users">;
    messageId: string;
    text: string;
    chatId?: string;
    sourceType: "notebook_ocr";
    sourceRawText: string;
    sourceStorageUrl?: string;
  },
): Promise<VisionPipelineResult> {
  const sanitized = sanitizeInboundText(params.text);
  if (!sanitized.accepted) {
    return { ok: false, reason: "empty_or_junk_text" };
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
  const referenceDate = new Date();
  const parsed = await parseInputForIngest({
    text: sanitized.text,
    timezone: DEFAULT_TIMEZONE,
    locale: "he-IL",
    referenceDate,
    allowedTags,
    lessons,
  });
  const enriched = enrichParsedItemsWithAnalysis(parsed.items, {
    sourceType: "notebook_ocr",
    sourceText: sanitized.text,
    timezone: DEFAULT_TIMEZONE,
    referenceDate,
  });
  const saved = await ctx.runMutation(internal.ingest.saveParsedItems, {
    userId: params.userId,
    sourceType: params.sourceType,
    sourceRawText: params.sourceRawText,
    sourceCorrectedText: sanitized.text,
    sourceStorageUrl: params.sourceStorageUrl ?? null,
    whatsappMessageId: params.messageId,
    sourceMetadata: {
      caption_only: true,
      whatsapp_chat_id: params.chatId,
      parse_response: parsed,
    },
    items: enriched.map((item) => ({
      title: item.title,
      content: item.content,
      isActionable: item.is_actionable,
      dueDate: item.is_actionable ? item.due_date : null,
      tags: item.tags,
      metadata: { analysis: item.analysis },
    })),
  });
  await markSenderMessageRead(ctx, {
    chatId: params.chatId,
    messageId: params.messageId,
  });
  return {
    ok: true,
    reason: "ingested_caption",
    rawTranscription: params.sourceRawText,
    correctedTranscription: sanitized.text,
    createdCount: saved.createdCount,
  };
}
