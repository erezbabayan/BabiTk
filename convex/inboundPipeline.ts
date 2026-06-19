"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";
import { enrichParsedItemsWithAnalysis } from "./lib/ingest/itemAnalysis";
import {
  WHATSAPP_REJECTION_MESSAGE,
  buildIngestConfirmation,
} from "./lib/messages";
import { replyToSender } from "./lib/replyToSender";
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
  },
): Promise<{ createdCount: number }> {
  const timezone = DEFAULT_TIMEZONE;
  const referenceDate = new Date();

  const sanitized = sanitizeInboundText(params.text);
  if (!sanitized.accepted) {
    throw new Error("empty_or_junk_text");
  }

  const parsed = await parseInputForIngest({
    text: sanitized.text,
    timezone,
    locale: "he-IL",
    referenceDate,
  });

  const enriched = enrichParsedItemsWithAnalysis(parsed.items, {
    sourceType: params.sourceType,
    sourceText: sanitized.text,
    timezone,
    referenceDate,
  });

  const result = await ctx.runMutation(internal.ingest.saveParsedItems, {
    userId: params.userId,
    sourceType: params.sourceType,
    sourceRawText: params.sourceRawText,
    sourceCorrectedText:
      typeof params.extraMetadata?.corrected_transcription === "string"
        ? params.extraMetadata.corrected_transcription
        : null,
    sourceStorageUrl: params.sourceStorageUrl ?? null,
    whatsappMessageId: params.messageId,
    sourceMetadata: {
      ...(params.extraMetadata ?? {}),
      parse_response: parsed,
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

  await replyToSender(
    ctx,
    params.senderPhone,
    buildIngestConfirmation(result.createdCount),
  );

  return result;
}

export const processGreenApiMessage = internalAction({
  args: {
    userId: v.id("users"),
    messageId: v.string(),
    senderPhone: v.string(),
    messageType: v.string(),
    text: v.optional(v.string()),
    audioUrl: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<InboundProcessResult> => {
    if (args.messageType === "audio") {
      if (!args.audioUrl) {
        return { ok: false, reason: "missing_audio_url" };
      }

      const voice = await ctx.runAction(internal.voicePipeline.processVoiceMessage, {
        userId: args.userId as Id<"users">,
        messageId: args.messageId,
        audioUrl: args.audioUrl,
        senderPhone: args.senderPhone,
        mimeType: args.mimeType,
      });

      return {
        ok: voice.ok,
        reason: voice.reason,
        sourceType: "whatsapp_voice",
        transcription: voice.transcription,
        durationSeconds: voice.durationSeconds,
        createdCount: voice.createdCount,
      };
    }

    if (args.messageType === "image") {
      if (!args.imageUrl) {
        return { ok: false, reason: "missing_image_url" };
      }

      const vision = await ctx.runAction(internal.visionPipeline.processNotebookImage, {
        userId: args.userId as Id<"users">,
        messageId: args.messageId,
        imageUrl: args.imageUrl,
        senderPhone: args.senderPhone,
        mimeType: args.mimeType,
      });

      return {
        ok: vision.ok,
        reason: vision.reason,
        sourceType: "notebook_ocr",
        transcription: vision.correctedTranscription,
        rawTranscription: vision.rawTranscription,
        correctedTranscription: vision.correctedTranscription,
        createdCount: vision.createdCount,
      };
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
        });

        return {
          ok: true,
          reason: "ingested",
          sourceType: "whatsapp_text",
          createdCount: result.createdCount,
        };
      } catch (error) {
        if (error instanceof Error && error.message === "empty_or_junk_text") {
          await replyToSender(ctx, args.senderPhone, WHATSAPP_REJECTION_MESSAGE);
          return { ok: false, reason: "empty_or_junk_text" };
        }
        throw error;
      }
    }

    return { ok: false, reason: "unsupported_message_type" };
  },
});
