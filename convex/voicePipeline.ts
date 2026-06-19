"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { enrichParsedItemsWithAnalysis } from "./lib/ingest/itemAnalysis";
import { storeMediaBuffer } from "./lib/mediaStorage";
import {
  AUDIO_QUOTA_MESSAGE,
  WHATSAPP_REJECTION_MESSAGE,
  buildIngestConfirmation,
} from "./lib/messages";
import { replyToSender } from "./lib/replyToSender";
import type { ParseInputResponse } from "./lib/ingest/types";
import {
  downloadMedia,
  estimateAudioSeconds,
  parseInputForIngest,
  sanitizeInboundText,
  transcribeAudioBuffer,
} from "./openaiPipeline";

const DEFAULT_TIMEZONE = "Asia/Jerusalem";

export type VoicePipelineResult = {
  ok: boolean;
  reason: string;
  transcription?: string;
  durationSeconds?: number;
  parseResponse?: ParseInputResponse;
  createdCount?: number;
};

function audioFileName(messageId: string, mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime.includes("mpeg") || mime.includes("mp3")) return `${messageId}.mp3`;
  if (mime.includes("mp4") || mime.includes("m4a")) return `${messageId}.m4a`;
  if (mime.includes("wav")) return `${messageId}.wav`;
  if (mime.includes("webm")) return `${messageId}.webm`;
  return `${messageId}.ogg`;
}

export const processVoiceMessage = internalAction({
  args: {
    userId: v.id("users"),
    messageId: v.string(),
    audioUrl: v.string(),
    senderPhone: v.optional(v.string()),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<VoicePipelineResult> => {
    const { buffer, mimeType: downloadedMime } = await downloadMedia(args.audioUrl);
    const mimeType = args.mimeType ?? downloadedMime;
    const estimatedSeconds = estimateAudioSeconds(buffer);

    const quota: { allowed: boolean } = await ctx.runQuery(
      internal.users.checkAudioQuota,
      { userId: args.userId as Id<"users">, estimatedSeconds },
    );
    if (!quota.allowed) {
      await replyToSender(ctx, args.senderPhone, AUDIO_QUOTA_MESSAGE);
      return { ok: false, reason: "audio_quota_exceeded" };
    }

    const storageId = await storeMediaBuffer(ctx, buffer, mimeType);
    const transcribed = await transcribeAudioBuffer(
      buffer,
      audioFileName(args.messageId, mimeType),
      mimeType,
    );

    const sanitized = sanitizeInboundText(transcribed.text);
    if (!sanitized.accepted) {
      await replyToSender(ctx, args.senderPhone, WHATSAPP_REJECTION_MESSAGE);
      return { ok: false, reason: "empty_or_junk_text" };
    }

    const referenceDate = new Date();
    const parsed = await parseInputForIngest({
      text: sanitized.text,
      timezone: DEFAULT_TIMEZONE,
      locale: "he-IL",
      referenceDate,
    });

    const enriched = enrichParsedItemsWithAnalysis(parsed.items, {
      sourceType: "whatsapp_voice",
      sourceText: sanitized.text,
      timezone: DEFAULT_TIMEZONE,
      referenceDate,
    });

    const saved = await ctx.runMutation(internal.ingest.saveParsedItems, {
      userId: args.userId as Id<"users">,
      sourceType: "whatsapp_voice",
      sourceRawText: transcribed.text,
      sourceStorageUrl: args.audioUrl,
      sourceStorageId: storageId,
      whatsappMessageId: args.messageId,
      sourceMetadata: {
        whisper_transcription: transcribed.text,
        duration_seconds: transcribed.durationSeconds,
        parse_response: parsed,
        audio_mime_type: mimeType,
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

    await ctx.runMutation(internal.users.recordAudioUsage, {
      userId: args.userId as Id<"users">,
      seconds: transcribed.durationSeconds,
    });

    await replyToSender(
      ctx,
      args.senderPhone,
      buildIngestConfirmation(saved.createdCount),
    );

    return {
      ok: true,
      reason: "ingested",
      transcription: transcribed.text,
      durationSeconds: transcribed.durationSeconds,
      parseResponse: parsed,
      createdCount: saved.createdCount,
    };
  },
});
