import { ingestText } from "./ingest.service.js";
import { ingestTextToSyncStore } from "./sync-ingest.service.js";
import {
  findInboxUserByCaptureGroup,
  findInboxUserByPhone,
  uploadSourceMedia,
  type SaveIngestionResult,
} from "./items.service.js";
import { env } from "../config/env.js";
import { extractNluTaskFromTranscription } from "./nlu-extract.service.js";
import { integrateNluTaskForWhatsAppSender } from "./nlu-task.service.js";
import { processNotebookOCR, proofreadHebrewInboundText, transcribeAudio } from "./openai.service.js";
import { applyHebrewAsrSpellingFixes } from "../lib/ingest/hebrewAsrSpelling.js";
import { isVoicePlaceholderText } from "../lib/ingest/voice-text.js";
import {
  assertAudioQuota,
  assertAiParseQuota,
  estimateAudioSeconds,
  estimateTextParseUnits,
  incrementAudioUsage,
} from "./usage.service.js";
import { downloadInboundMedia } from "./whatsapp/media.js";
import { sendWhatsAppText } from "./whatsapp/send.js";
import type { WhatsAppInboundMessage } from "../types/whatsapp.js";
import {
  sanitizeInboundText,
  WHATSAPP_REJECTION_MESSAGE,
} from "../utils/whatsapp.js";
import { UsageQuotaExceededError } from "./usage.service.js";
import { buildCaptureConfirmation } from "../lib/whatsapp-commands.js";
import { isSystemWhatsAppReply } from "../lib/whatsapp-query.js";
import {
  handleWhatsAppTextIntent,
  maybeSendWhatsAppMenuOnboarding,
  rememberLastWhatsAppItems,
  replyDestination,
} from "./whatsapp-actions.service.js";

async function resolveInboxOwner(message: WhatsAppInboundMessage) {
  const byPhone = await findInboxUserByPhone(message.from);
  if (byPhone) return byPhone;
  if (message.chatId) {
    return findInboxUserByCaptureGroup(message.chatId);
  }
  return null;
}

async function confirmCapture(
  userId: string,
  replyTo: string,
  result: SaveIngestionResult,
): Promise<void> {
  const ids = result.items.map((item) => item.id);
  if (ids.length > 0) {
    await rememberLastWhatsAppItems(userId, ids);
  }
  await sendWhatsAppText(replyTo, buildCaptureConfirmation(result.items));
}

async function saveToUserInbox(params: {
  userId: string;
  text: string;
  sourceType: "whatsapp_text" | "whatsapp_voice" | "notebook_ocr" | "typed_text" | "image" | "document";
  rawText?: string;
  storageUrl?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return ingestText({
    userId: params.userId,
    text: params.text,
    sourceType: params.sourceType,
    rawText: params.rawText,
    storageUrl: params.storageUrl,
    metadata: params.metadata,
  });
}

export async function processWhatsAppMessage(
  message: WhatsAppInboundMessage,
): Promise<void> {
  if (
    !env.isSupabaseConfigured &&
    env.demoSyncEnabled &&
    message.type === "text" &&
    message.text
  ) {
    await ingestTextToSyncStore({
      text: message.text,
      sourceType: "whatsapp_text",
      metadata: { whatsapp_message_id: message.id, channel: "whatsapp" },
    });
    return;
  }

  const user = await resolveInboxOwner(message);
  if (!user) {
    return;
  }

  const replyTo = replyDestination(message);

  if (message.type === "text") {
    const inbound = (message.buttonReply || message.text || "").trim();
    if (!inbound || isSystemWhatsAppReply(inbound)) return;

    const handled = await handleWhatsAppTextIntent({
      user,
      text: inbound,
      replyTo,
    });
    if (handled) {
      await maybeSendWhatsAppMenuOnboarding({
        user,
        replyTo,
        isGroup: Boolean(message.chatId?.endsWith("@g.us")),
      });
      return;
    }

    await assertAiParseQuota(user.id, estimateTextParseUnits(inbound));

    const result = await saveToUserInbox({
      userId: user.id,
      text: inbound,
      sourceType: "whatsapp_text",
      metadata: {
        whatsapp_message_id: message.id,
        whatsapp_chat_id: message.chatId,
        forwarded: message.forwarded === true,
      },
    });
    await confirmCapture(user.id, replyTo, result);
    await maybeSendWhatsAppMenuOnboarding({
      user,
      replyTo,
      isGroup: Boolean(message.chatId?.endsWith("@g.us")),
    });
    return;
  }

  if (message.type === "audio" && (message.audioId || message.audioUrl)) {
    const { buffer, mimeType } = await downloadInboundMedia(message);
    const estimatedSeconds = estimateAudioSeconds(buffer);
    await assertAudioQuota(user.id, estimatedSeconds);

    const storageUrl = await uploadSourceMedia(
      user.id,
      `${message.id}.ogg`,
      buffer,
      mimeType,
    );

    const { text, durationSeconds } = await transcribeAudio(
      buffer,
      `${message.id}.ogg`,
      mimeType,
    );

    const correctedText = applyHebrewAsrSpellingFixes(
      await proofreadHebrewInboundText(text),
    );
    const textCheck = sanitizeInboundText(correctedText);
    if (!textCheck.accepted || isVoicePlaceholderText(correctedText)) {
      await sendWhatsAppText(replyTo, WHATSAPP_REJECTION_MESSAGE);
      return;
    }

    await incrementAudioUsage(user.id, durationSeconds);

    const nluPayload = await extractNluTaskFromTranscription(correctedText);
    const integration = await integrateNluTaskForWhatsAppSender(message.from, nluPayload, {
      storageUrl,
      metadata: {
        whatsapp_message_id: message.id,
        duration_seconds: durationSeconds,
        whisper_transcription: text,
        corrected_transcription: correctedText,
      },
    });

    if (integration.success) {
      await sendWhatsAppText(replyTo, integration.responseText);
      return;
    }

    const voiceResult = await saveToUserInbox({
      userId: user.id,
      text: correctedText,
      sourceType: "whatsapp_voice",
      rawText: text,
      storageUrl,
      metadata: {
        whatsapp_message_id: message.id,
        duration_seconds: durationSeconds,
        whisper_transcription: text,
        corrected_transcription: correctedText,
        whatsapp_chat_id: message.chatId,
      },
    });
    await confirmCapture(user.id, replyTo, voiceResult);
    return;
  }

  if (message.type === "image" && (message.imageId || message.imageUrl)) {
    await assertAiParseQuota(user.id);

    const { buffer, mimeType } = await downloadInboundMedia(message);
    const { extractedText, metadata: ocrMetadata, imageBuffer, imageMimeType } =
      await processNotebookOCR(buffer, mimeType);
    const storageUrl = await uploadSourceMedia(
      user.id,
      `${message.id}.jpg`,
      imageBuffer,
      imageMimeType,
    );

    const textCheck = sanitizeInboundText(extractedText);
    if (!textCheck.accepted) {
      await sendWhatsAppText(replyTo, WHATSAPP_REJECTION_MESSAGE);
      return;
    }

    const ocrResult = await saveToUserInbox({
      userId: user.id,
      text: extractedText,
      sourceType: "notebook_ocr",
      rawText: ocrMetadata.raw_transcription,
      storageUrl,
      metadata: {
        whatsapp_message_id: message.id,
        whatsapp_chat_id: message.chatId,
        ...ocrMetadata,
      },
    });
    await confirmCapture(user.id, replyTo, ocrResult);
    return;
  }

  await sendWhatsAppText(replyTo, WHATSAPP_REJECTION_MESSAGE);
}

export async function safeProcessWhatsAppMessage(
  message: WhatsAppInboundMessage,
): Promise<void> {
  try {
    await processWhatsAppMessage(message);
  } catch (error) {
    if (error instanceof UsageQuotaExceededError) {
      const msg =
        error.code === "audio_quota"
          ? "הגעת למכסת התמלול החודשית. שדרג ל-Premium כדי להמשיך."
          : "הגעת למכסת ה-AI החודשית. שדרג ל-Premium כדי להמשיך.";
      await sendWhatsAppText(replyDestination(message), msg);
      return;
    }

    throw error;
  }
}
