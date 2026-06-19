"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { enrichParsedItemsWithAnalysis } from "./lib/ingest/itemAnalysis";
import { isOpenAiUsable } from "./lib/ingest/parseInput";
import { storeMediaBuffer } from "./lib/mediaStorage";
import {
  WHATSAPP_REJECTION_MESSAGE,
  buildIngestConfirmation,
} from "./lib/messages";
import { replyToSender } from "./lib/replyToSender";
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
};

export const processNotebookImage = internalAction({
  args: {
    userId: v.id("users"),
    messageId: v.string(),
    imageUrl: v.string(),
    senderPhone: v.optional(v.string()),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<VisionPipelineResult> => {
    if (!isOpenAiUsable()) {
      return { ok: false, reason: "openai_not_configured" };
    }

    const { buffer, mimeType: downloadedMime } = await downloadMedia(args.imageUrl);
    const mimeType = args.mimeType ?? downloadedMime;
    const storageId = await storeMediaBuffer(ctx, buffer, mimeType);

    const { rawTranscription, imageMimeType } = await transcribeNotebookImageVision(
      buffer,
      mimeType,
    );
    const correctedTranscription = await refineNotebookTranscription(rawTranscription);

    const sanitized = sanitizeInboundText(correctedTranscription);
    if (!sanitized.accepted) {
      await replyToSender(ctx, args.senderPhone, WHATSAPP_REJECTION_MESSAGE);
      return { ok: false, reason: "empty_or_junk_text", rawTranscription };
    }

    const referenceDate = new Date();
    const parsed = await parseInputForIngest({
      text: sanitized.text,
      timezone: DEFAULT_TIMEZONE,
      locale: "he-IL",
      referenceDate,
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
      sourceRawText: rawTranscription,
      sourceCorrectedText: correctedTranscription,
      sourceStorageUrl: args.imageUrl,
      sourceStorageId: storageId,
      whatsappMessageId: args.messageId,
      sourceMetadata: {
        raw_transcription: rawTranscription,
        corrected_transcription: correctedTranscription,
        image_mime_type: imageMimeType,
        vision_model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o",
        refine_model: process.env.OPENAI_PARSE_MODEL ?? "gpt-4o-mini",
        parse_response: parsed,
        storage_id: storageId,
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
      args.senderPhone,
      buildIngestConfirmation(saved.createdCount),
    );

    return {
      ok: true,
      reason: "ingested",
      rawTranscription,
      correctedTranscription,
      parseResponse: parsed,
      createdCount: saved.createdCount,
    };
  },
});
