"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, type ActionCtx } from "./_generated/server";
import { applyHebrewAsrSpellingFixes } from "./lib/ingest/hebrewAsrSpelling";
import { enrichParsedItemsWithAnalysis } from "./lib/ingest/itemAnalysis";
import { mergeContinuationParsedItems } from "./lib/ingest/inputSegmentation";
import { parseInputLocally } from "./lib/ingest/localParse";
import {
  snapshotHebrewAsrEnv,
  transcribeHebrewAudio,
  type HebrewAsrEnvSnapshot,
} from "./lib/hebrewAsr";
import { isVisionOcrConfigured } from "./lib/imageVision";
import { storeMediaBuffer } from "./lib/mediaStorage";
import {
  estimateAudioSeconds,
  normalizeInboundCaptureText,
  parseInputForIngest,
  probeOpenAiTranscription,
  refineNotebookTranscription,
  sanitizeInboundText,
  transcribeNotebookImageVision,
} from "./openaiPipeline";

/** Node action args max ~5 MiB; keep base64 well under that after encoding overhead. */
const BASE64_MAX_BYTES = Math.floor(2.5 * 1024 * 1024);

export const ingestQuickText = action({
  args: {
    userId: v.id("users"),
    text: v.string(),
    timezone: v.optional(v.string()),
    locale: v.optional(v.string()),
  },
  returns: v.object({
    createdCount: v.number(),
  }),
  handler: async (ctx, args): Promise<{ createdCount: number }> => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      throw new Error("Not authenticated");
    }
    if (authUserId !== args.userId) {
      throw new Error("Unauthorized");
    }

    const sanitized = sanitizeInboundText(args.text);
    if (!sanitized.accepted) {
      throw new Error("הטקסט קצר מדי או לא תקין");
    }

    await ctx.runMutation(internal.userTagDefinitions.ensureDefaults, {
      userId: args.userId,
    });
    const allowedTags = await ctx.runQuery(internal.userTagDefinitions.listNamesInternal, {
      userId: args.userId,
    });
    const lessons = await ctx.runQuery(internal.ingestLessons.listForUserInternal, {
      userId: args.userId,
    });

    const timezone = args.timezone ?? "Asia/Jerusalem";
    const referenceDate = new Date();
    const syncText = applyHebrewAsrSpellingFixes(sanitized.text);

    // Instant local parse so the boards update before any LLM round-trip.
    const localParsed = parseInputLocally({
      text: syncText,
      timezone,
      locale: args.locale ?? "he-IL",
      referenceDate,
      allowedTags,
      lessons,
    });

    const mergedItems = mergeContinuationParsedItems(localParsed.items, syncText);

    const enriched = enrichParsedItemsWithAnalysis(mergedItems, {
      sourceType: "typed_text",
      sourceText: syncText,
      timezone,
      referenceDate,
    });

    const result = await ctx.runMutation(internal.ingest.saveParsedItems, {
      userId: args.userId,
      sourceType: "typed_text",
      sourceRawText: sanitized.text,
      sourceCorrectedText: syncText,
      sourceMetadata: { parse_path: "local_fast" },
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

    if (result.created.length > 0) {
      await ctx.scheduler.runAfter(0, internal.inboundPipeline.refineIngestedText, {
        userId: args.userId,
        messageId: `typed:${result.created[0]!.id}`,
        text: syncText,
        sourceType: "typed_text",
        created: result.created,
      });
    }

    return { createdCount: result.createdCount };
  },
});

function voiceFileName(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime.includes("mpeg") || mime.includes("mp3")) return "capture.mp3";
  if (mime.includes("wav")) return "capture.wav";
  if (mime.includes("webm")) return "capture.webm";
  if (mime.includes("ogg")) return "capture.ogg";
  if (mime.includes("3gp")) return "capture.3gp";
  return "capture.m4a";
}

async function ingestVoiceBuffer(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    buffer: Buffer;
    mimeType: string;
    storageId: Id<"_storage">;
    timezone?: string;
    locale?: string;
    asrEnv: HebrewAsrEnvSnapshot;
    /** Client-reported duration; preferred over byte-size estimate for quota. */
    durationSeconds?: number;
  },
): Promise<{ createdCount: number; transcription: string }> {
  const mimeType = args.mimeType || "audio/m4a";
  const estimatedSeconds =
    typeof args.durationSeconds === "number" && args.durationSeconds > 0
      ? Math.max(1, Math.ceil(args.durationSeconds))
      : estimateAudioSeconds(args.buffer, mimeType);

  const quota: { allowed: boolean } = await ctx.runQuery(internal.users.checkAudioQuota, {
    userId: args.userId,
    estimatedSeconds,
  });
  if (!quota.allowed) {
    throw new Error("הגעת למכסת התמלול החודשית");
  }

  const transcribed = await transcribeHebrewAudio(
    args.buffer,
    voiceFileName(mimeType),
    mimeType,
    args.asrEnv,
  );

  const sanitized = sanitizeInboundText(transcribed.text);
  if (!sanitized.accepted) {
    throw new Error("לא זוהה דיבור ברור בהקלטה");
  }

  const correctedText = await normalizeInboundCaptureText(sanitized.text);

  await ctx.runMutation(internal.userTagDefinitions.ensureDefaults, {
    userId: args.userId,
  });
  const allowedTags = await ctx.runQuery(internal.userTagDefinitions.listNamesInternal, {
    userId: args.userId,
  });
  const lessons = await ctx.runQuery(internal.ingestLessons.listForUserInternal, {
    userId: args.userId,
  });

  const timezone = args.timezone ?? "Asia/Jerusalem";
  const referenceDate = new Date();

  const parsed = await parseInputForIngest({
    text: correctedText,
    timezone,
    locale: args.locale ?? "he-IL",
    referenceDate,
    allowedTags,
    lessons,
    alreadyNormalized: true,
  });

  const mergedItems = mergeContinuationParsedItems(parsed.items, correctedText);
  const enriched = enrichParsedItemsWithAnalysis(mergedItems, {
    sourceType: "whatsapp_voice",
    sourceText: correctedText,
    timezone,
    referenceDate,
  });

  const storageUrl = await ctx.storage.getUrl(args.storageId);

  const result = await ctx.runMutation(internal.ingest.saveParsedItems, {
    userId: args.userId,
    sourceType: "whatsapp_voice",
    sourceRawText: correctedText,
    sourceStorageUrl: storageUrl ?? undefined,
    sourceStorageId: args.storageId,
    sourceMetadata: {
      whisper_transcription: transcribed.text,
      corrected_transcription: correctedText,
      duration_seconds: transcribed.durationSeconds,
      parse_response: parsed,
      audio_mime_type: mimeType,
      storage_id: args.storageId,
      capture_channel: "mobile_mic",
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
    userId: args.userId,
    seconds: transcribed.durationSeconds,
  });

  return {
    createdCount: result.createdCount,
    transcription: correctedText,
  };
}

/** Mobile/web: transcribe audio already uploaded to Convex storage. */
export const ingestVoiceCapture = action({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    timezone: v.optional(v.string()),
    locale: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
  },
  returns: v.object({
    createdCount: v.number(),
    transcription: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ createdCount: number; transcription: string }> => {
    const asrEnv = snapshotHebrewAsrEnv();

    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      throw new Error("Not authenticated");
    }
    const userId = authUserId;

    const blob = await ctx.storage.get(args.storageId);
    if (!blob) {
      throw new Error("קובץ ההקלטה לא נמצא");
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    return await ingestVoiceBuffer(ctx, {
      userId,
      buffer,
      mimeType: args.mimeType || "audio/m4a",
      storageId: args.storageId,
      timezone: args.timezone,
      locale: args.locale,
      asrEnv,
      durationSeconds: args.durationSeconds,
    });
  },
});

/**
 * Short-clip fallback: accept base64 audio, store it, then transcribe.
 * Prefer ingestVoiceCapture + generateUploadUrl for normal recordings
 * (Node action args are capped at ~5 MiB).
 */
export const ingestVoiceFromBase64 = action({
  args: {
    userId: v.id("users"),
    audioBase64: v.string(),
    mimeType: v.string(),
    timezone: v.optional(v.string()),
    locale: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
  },
  returns: v.object({
    createdCount: v.number(),
    transcription: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ createdCount: number; transcription: string }> => {
    const asrEnv = snapshotHebrewAsrEnv();

    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      throw new Error("Not authenticated");
    }
    const userId = authUserId;

    const trimmed = args.audioBase64.trim();
    if (trimmed.length < 32) {
      throw new Error("ההקלטה ריקה");
    }
    const approxBytes = Math.floor((trimmed.length * 3) / 4);
    if (approxBytes > BASE64_MAX_BYTES) {
      throw new Error(
        "ההקלטה ארוכה מדי לנתיב הגיבוי. הקליטו קצר יותר או נסו שוב.",
      );
    }

    const buffer = Buffer.from(trimmed, "base64");
    if (buffer.length < 64) {
      throw new Error("ההקלטה ריקה או פגומה");
    }

    const mimeType = args.mimeType || "audio/mp4";
    const storageId = await storeMediaBuffer(ctx, buffer, mimeType);

    return await ingestVoiceBuffer(ctx, {
      userId,
      buffer,
      mimeType,
      storageId,
      timezone: args.timezone,
      locale: args.locale,
      asrEnv,
      durationSeconds: args.durationSeconds,
    });
  },
});

/** Mobile/web: OCR a notebook/photo already uploaded to Convex storage. */
export const ingestNotebookImage = action({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
    mimeType: v.string(),
    timezone: v.optional(v.string()),
    locale: v.optional(v.string()),
  },
  returns: v.object({
    createdCount: v.number(),
    extractedText: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ createdCount: number; extractedText: string }> => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      throw new Error("Not authenticated");
    }
    const userId = authUserId;

    if (!isVisionOcrConfigured()) {
      throw new Error("סריקת תמונה אינה מוגדרת בשרת");
    }

    const blob = await ctx.storage.get(args.storageId);
    if (!blob) {
      throw new Error("קובץ התמונה לא נמצא");
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    if (buffer.length < 64) {
      throw new Error("התמונה ריקה או פגומה");
    }

    const mimeType = args.mimeType || "image/jpeg";
    let rawTranscription: string;
    let engine = "vision";
    try {
      const vision = await transcribeNotebookImageVision(buffer, mimeType);
      rawTranscription = vision.rawTranscription;
      if (vision.engine) engine = vision.engine;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`זיהוי טקסט מהתמונה נכשל: ${detail}`);
    }

    let correctedTranscription = rawTranscription;
    try {
      correctedTranscription = await refineNotebookTranscription(rawTranscription);
    } catch {
      correctedTranscription = rawTranscription;
    }

    const sanitized = sanitizeInboundText(correctedTranscription);
    if (!sanitized.accepted) {
      throw new Error("לא זוהה טקסט ברור בתמונה");
    }

    await ctx.runMutation(internal.userTagDefinitions.ensureDefaults, {
      userId,
    });
    const allowedTags = await ctx.runQuery(internal.userTagDefinitions.listNamesInternal, {
      userId,
    });
    const lessons = await ctx.runQuery(internal.ingestLessons.listForUserInternal, {
      userId,
    });

    const timezone = args.timezone ?? "Asia/Jerusalem";
    const referenceDate = new Date();
    const parsed = await parseInputForIngest({
      text: sanitized.text,
      timezone,
      locale: args.locale ?? "he-IL",
      referenceDate,
      allowedTags,
      lessons,
    });

    const enriched = enrichParsedItemsWithAnalysis(parsed.items, {
      sourceType: "notebook_ocr",
      sourceText: sanitized.text,
      timezone,
      referenceDate,
    });

    const storageUrl = await ctx.storage.getUrl(args.storageId);

    const result = await ctx.runMutation(internal.ingest.saveParsedItems, {
      userId,
      sourceType: "notebook_ocr",
      sourceRawText: rawTranscription,
      sourceCorrectedText: correctedTranscription,
      sourceStorageUrl: storageUrl ?? undefined,
      sourceStorageId: args.storageId,
      sourceMetadata: {
        raw_transcription: rawTranscription,
        corrected_transcription: correctedTranscription,
        image_mime_type: mimeType,
        vision_engine: engine,
        parse_response: parsed,
        storage_id: args.storageId,
        capture_channel: "app_camera",
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

    return {
      createdCount: result.createdCount,
      extractedText: sanitized.text,
    };
  },
});

/** Admin/dev probe: verify OpenAI models + Whisper from Convex Node. */
export const diagnoseTranscription = action({
  args: {},
  returns: v.object({
    modelsOk: v.boolean(),
    whisperOk: v.boolean(),
    modelsStatus: v.optional(v.number()),
    whisperDetail: v.optional(v.string()),
    keyPrefix: v.string(),
    asrEngine: v.string(),
    groqConfigured: v.boolean(),
    runpodConfigured: v.boolean(),
  }),
  handler: async () => {
    const asrEnv = snapshotHebrewAsrEnv();
    const probe = await probeOpenAiTranscription(asrEnv.openAi?.apiKey);
    return {
      ...probe,
      asrEngine: asrEnv.enginePreference,
      groqConfigured: Boolean(asrEnv.groq?.apiKey),
      runpodConfigured: Boolean(asrEnv.runpodApiKey && asrEnv.runpodEndpointId),
    };
  },
});
