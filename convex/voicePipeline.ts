"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { enrichParsedItemsWithAnalysis } from "./lib/ingest/itemAnalysis";
import { applyHebrewAsrSpellingFixes } from "./lib/ingest/hebrewAsrSpelling";
import { parseInputLocally } from "./lib/ingest/localParse";
import { storeMediaBuffer } from "./lib/mediaStorage";
import { markSenderMessageRead } from "./lib/replyToSender";
import type { ParseInputResponse } from "./lib/ingest/types";
import {
  downloadMedia,
  estimateAudioSeconds,
  sanitizeInboundText,
} from "./openaiPipeline";
import { snapshotHebrewAsrEnv, transcribeHebrewAudio } from "./lib/hebrewAsr";

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
    chatId: v.optional(v.string()),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<VoicePipelineResult> => {
    const asrEnv = snapshotHebrewAsrEnv();

    const { buffer, mimeType: downloadedMime } = await downloadMedia(args.audioUrl);
    const mimeType = args.mimeType ?? downloadedMime;
    const estimatedSeconds = estimateAudioSeconds(buffer);

    const quota: { allowed: boolean } = await ctx.runQuery(
      internal.users.checkAudioQuota,
      { userId: args.userId as Id<"users">, estimatedSeconds },
    );
    if (!quota.allowed) {
      return { ok: false, reason: "audio_quota_exceeded" };
    }

    const storageId = await storeMediaBuffer(ctx, buffer, mimeType);
    const transcribed = await transcribeHebrewAudio(
      buffer,
      audioFileName(args.messageId, mimeType),
      mimeType,
      asrEnv,
    );

    const sanitized = sanitizeInboundText(transcribed.text);
    if (!sanitized.accepted) {
      return { ok: false, reason: "empty_or_junk_text" };
    }

    const correctedText = applyHebrewAsrSpellingFixes(sanitized.text);

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
    const localParsed = parseInputLocally({
      text: correctedText,
      timezone: DEFAULT_TIMEZONE,
      locale: "he-IL",
      referenceDate,
      allowedTags,
      lessons,
    });

    const enriched = enrichParsedItemsWithAnalysis(localParsed.items, {
      sourceType: "whatsapp_voice",
      sourceText: correctedText,
      timezone: DEFAULT_TIMEZONE,
      referenceDate,
    });

    const saved = await ctx.runMutation(internal.ingest.saveParsedItems, {
      userId: args.userId as Id<"users">,
      sourceType: "whatsapp_voice",
      sourceRawText: transcribed.text,
      sourceCorrectedText: correctedText,
      sourceStorageUrl: args.audioUrl,
      sourceStorageId: storageId,
      whatsappMessageId: args.messageId,
      sourceMetadata: {
        whisper_transcription: transcribed.text,
        corrected_transcription: correctedText,
        duration_seconds: transcribed.durationSeconds,
        parse_response: localParsed,
        parse_path: "local_fast",
        audio_mime_type: mimeType,
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

    if (saved.created.length > 0) {
      await ctx.scheduler.runAfter(0, internal.inboundPipeline.refineIngestedText, {
        userId: args.userId as Id<"users">,
        messageId: args.messageId,
        text: correctedText,
        sourceType: "whatsapp_voice",
        created: saved.created,
        chatId: args.chatId,
      });
    }

    await ctx.runMutation(internal.users.recordAudioUsage, {
      userId: args.userId as Id<"users">,
      seconds: transcribed.durationSeconds,
    });

    await markSenderMessageRead(ctx, {
      chatId: args.chatId,
      messageId: args.messageId,
    });

    return {
      ok: true,
      reason: "ingested",
      transcription: correctedText,
      durationSeconds: transcribed.durationSeconds,
      parseResponse: localParsed,
      createdCount: saved.createdCount,
    };
  },
});
