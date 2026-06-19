import { ingestText } from "./ingest.service.js";
import { ingestTextToSyncStore } from "./sync-ingest.service.js";
import { findInboxUserByPhone, uploadSourceMedia } from "./items.service.js";
import { env } from "../config/env.js";
import { extractNluTaskFromTranscription } from "./nlu-extract.service.js";
import { integrateNluTaskForWhatsAppSender } from "./nlu-task.service.js";
import { processNotebookOCR, transcribeAudio } from "./openai.service.js";
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

/**
 * WhatsApp webhook → user Inbox pipeline
 * ========================================
 *
 * 1. Webhook receives JSON; parsers set `message.from` = sender phone (E.164).
 * 2. resolveInboxOwner(message.from):
 *        DB query → users WHERE phone = ? AND phone_verified = true
 *    • No user  → reply on WhatsApp: "מספר לא מקושר"
 *    • Found    → continue with that user.id
 * 3. By media type:
 *        text  → use body as-is
 *        audio → Whisper (Hebrew) → text
 *        image → GPT-4o OCR → text
 * 4. ingestText({ userId, text }) → AI parse → save to `items` (Inbox)
 *    Visible in Web + Mobile for the same account.
 */

const UNLINKED_PHONE_MESSAGE =
  "מספר הטלפון שלך לא מקושר לחשבון MindTasker. פתח הגדרות → וואטסאפ באפליקציה או ב-Web.";

async function resolveInboxOwner(senderPhone: string) {
  return findInboxUserByPhone(senderPhone);
}

async function saveToUserInbox(params: {
  userId: string;
  text: string;
  sourceType: "whatsapp_text" | "whatsapp_voice" | "notebook_ocr";
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

  // Step 2: match sender phone → MindTasker user (Supabase)
  const user = await resolveInboxOwner(message.from);
  if (!user) {
    await sendWhatsAppText(message.from, UNLINKED_PHONE_MESSAGE);
    return;
  }

  // Step 3 + 4: extract text → insert into this user's Inbox
  if (message.type === "text") {
    await assertAiParseQuota(user.id, estimateTextParseUnits(message.text!));

    await saveToUserInbox({
      userId: user.id,
      text: message.text!,
      sourceType: "whatsapp_text",
      metadata: { whatsapp_message_id: message.id },
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

    const textCheck = sanitizeInboundText(text);
    if (!textCheck.accepted) {
      await sendWhatsAppText(message.from, WHATSAPP_REJECTION_MESSAGE);
      return;
    }

    await incrementAudioUsage(user.id, durationSeconds);

    const nluPayload = await extractNluTaskFromTranscription(text);
    const integration = await integrateNluTaskForWhatsAppSender(message.from, nluPayload, {
      storageUrl,
      metadata: {
        whatsapp_message_id: message.id,
        duration_seconds: durationSeconds,
      },
    });

    if (integration.success) {
      await sendWhatsAppText(message.from, integration.responseText);
      return;
    }

    await saveToUserInbox({
      userId: user.id,
      text,
      sourceType: "whatsapp_voice",
      rawText: text,
      storageUrl,
      metadata: {
        whatsapp_message_id: message.id,
        duration_seconds: durationSeconds,
      },
    });
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
      await sendWhatsAppText(message.from, WHATSAPP_REJECTION_MESSAGE);
      return;
    }

    await saveToUserInbox({
      userId: user.id,
      text: extractedText,
      sourceType: "notebook_ocr",
      rawText: ocrMetadata.raw_transcription,
      storageUrl,
      metadata: { whatsapp_message_id: message.id, ...ocrMetadata },
    });
    return;
  }

  await sendWhatsAppText(message.from, WHATSAPP_REJECTION_MESSAGE);
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
      await sendWhatsAppText(message.from, msg);
      return;
    }

    throw error;
  }
}
