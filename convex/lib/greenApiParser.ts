import { normalizePhone, phoneFromWhatsAppId, senderIdFromWhatsAppChatId } from "./phone";
import {
  isGroupWhatsAppChat,
  isOwnerWhatsAppSender,
  isWhatsAppLidId,
  normalizeGroupChatId,
} from "./whatsappCaptureGroup";

export type GreenApiMessageType = "text" | "audio" | "image" | "unsupported";

export interface ParsedGreenApiMessage {
  messageId: string;
  senderId: string;
  senderPhone: string;
  chatId: string;
  /** incoming from peer vs outgoing from linked phone (user typed/recorded/shot). */
  direction: "incoming" | "outgoing";
  type: GreenApiMessageType;
  text?: string;
  audioUrl?: string;
  /** May be empty — resolved later via Green-API downloadFile(chatId, idMessage). */
  imageUrl?: string;
  mimeType?: string;
  caption?: string;
  chatName?: string;
}

export interface GreenApiWebhookPayload {
  typeWebhook?: string;
  idMessage?: string;
  instanceData?: { wid?: string; idInstance?: number | string };
  senderData?: {
    chatId?: string;
    sender?: string;
    chatName?: string;
    senderName?: string;
  };
  messageData?: {
    typeMessage?: string;
    textMessageData?: { textMessage?: string };
    extendedTextMessageData?: { text?: string };
    fileMessageData?: {
      downloadUrl?: string;
      mimeType?: string;
      caption?: string;
      fileName?: string;
      jpegThumbnail?: string;
    };
  };
}

const INGEST_WEBHOOKS = new Set([
  "incomingMessageReceived",
  "outgoingMessageReceived",
  // Intentionally NOT outgoingAPIMessageReceived — avoids re-ingesting digests/API sends.
]);

export { isGroupWhatsAppChat, normalizeGroupChatId };

export function isBroadcastWhatsAppChat(chatId: string): boolean {
  return chatId.trim().endsWith("@broadcast");
}

/** 1:1 peer chats (not groups/broadcasts). */
export function isDirectWhatsAppChat(chatId: string): boolean {
  const trimmed = chatId.trim();
  if (!trimmed) return false;
  if (isGroupWhatsAppChat(trimmed) || isBroadcastWhatsAppChat(trimmed)) {
    return false;
  }
  return trimmed.endsWith("@c.us") || trimmed.endsWith("@lid") || !trimmed.includes("@");
}

/** Outbound system replies we must not re-ingest as new capture. */
export function isSystemWhatsAppReply(text: string): boolean {
  const t = text.trim();
  return (
    t.startsWith("מידע חדש נכנס למערכת") ||
    t.includes("נכנסו למערכת BabaiTk") ||
    t.startsWith("נקלט פריט") ||
    t.startsWith("נקלטו ") ||
    t.startsWith("לא הצלחתי לזהות") ||
    t.startsWith("חרגת ממכסת") ||
    t.startsWith("מספר הטלפון שלך לא מקושר") ||
    t.startsWith("הודעה יומית") ||
    t.startsWith("מספר שולח נוסף") ||
    t.startsWith("✓ בדיקת") ||
    t.startsWith("📋 תזכורות")
  );
}

export function extractGreenApiSenderId(body: unknown): string | null {
  const payload = body as GreenApiWebhookPayload;
  const raw =
    payload.senderData?.sender?.trim() ||
    payload.senderData?.chatId?.trim() ||
    "";
  if (!raw) return null;
  return senderIdFromWhatsAppChatId(raw);
}

/**
 * Capture messages the linked user posts in:
 * - their capture WhatsApp group (@g.us), or
 * - Message Yourself / self chat (@c.us matching the instance phone)
 *   — required on Green-API free tier when groups are quota-blocked.
 */
function resolveIdentity(payload: GreenApiWebhookPayload): {
  chatId: string;
  senderId: string;
  senderPhone: string;
  direction: "incoming" | "outgoing";
  chatName?: string;
} | null {
  const typeWebhook = payload.typeWebhook ?? "";
  if (!INGEST_WEBHOOKS.has(typeWebhook)) return null;

  const chatId = payload.senderData?.chatId?.trim() ?? "";
  if (!chatId || isBroadcastWhatsAppChat(chatId)) return null;

  const wid = payload.instanceData?.wid?.trim() ?? "";
  if (!wid) return null;

  const direction: "incoming" | "outgoing" =
    typeWebhook === "outgoingMessageReceived" ? "outgoing" : "incoming";

  const senderRaw = payload.senderData?.sender?.trim() ?? "";

  // Outgoing webhooks are always from our linked instance. Sender is often @lid
  // (WhatsApp Linked ID) which cannot be digit-matched to the phone wid.
  const outgoingFromInstance = direction === "outgoing";
  const chatIsGroup = isGroupWhatsAppChat(chatId);
  if (outgoingFromInstance) {
    // accept
  } else if (!senderRaw) {
    return null;
  } else if (isWhatsAppLidId(senderRaw)) {
    // Linked-device posts into the capture group often arrive as incoming + @lid.
    // Accept those in groups (instance owns the session); drop @lid in 1:1 chats.
    if (!chatIsGroup) {
      return null;
    }
  } else if (!isOwnerWhatsAppSender(senderRaw, wid)) {
    return null;
  }

  const effectiveSender =
    !senderRaw || isWhatsAppLidId(senderRaw) ? wid : senderRaw;

  const isGroup = chatIsGroup;
  const isSelfChat =
    isDirectWhatsAppChat(chatId) && isOwnerWhatsAppSender(chatId, wid);

  // Groups always; self-chat only for outgoing (user typed into Message Yourself).
  if (!isGroup && !(isSelfChat && outgoingFromInstance)) {
    return null;
  }

  return {
    chatId: isGroup ? normalizeGroupChatId(chatId) : chatId.trim().toLowerCase(),
    senderId: senderIdFromWhatsAppChatId(effectiveSender),
    senderPhone: phoneFromWhatsAppId(effectiveSender),
    direction,
    chatName:
      payload.senderData?.chatName?.trim() ||
      (isSelfChat ? "הודעה לעצמי" : undefined),
  };
}

function extractText(payload: GreenApiWebhookPayload): string | undefined {
  const typeMessage = payload.messageData?.typeMessage;
  if (typeMessage === "textMessage") {
    return payload.messageData?.textMessageData?.textMessage?.trim();
  }
  if (typeMessage === "extendedTextMessage") {
    return payload.messageData?.extendedTextMessageData?.text?.trim();
  }
  const caption = payload.messageData?.fileMessageData?.caption?.trim();
  return caption || undefined;
}

function parseTextMessage(
  payload: GreenApiWebhookPayload,
): ParsedGreenApiMessage | null {
  const id = resolveIdentity(payload);
  if (!id) return null;
  const text = extractText(payload);
  if (!text) return null;
  if (isSystemWhatsAppReply(text)) return null;
  return {
    messageId: payload.idMessage ?? `green-${Date.now()}`,
    senderId: id.senderId,
    senderPhone: id.senderPhone,
    chatId: id.chatId,
    direction: id.direction,
    type: "text",
    text,
    chatName: id.chatName,
  };
}

function parseFileMessage(
  payload: GreenApiWebhookPayload,
  mediaType: "audio" | "image",
): ParsedGreenApiMessage | null {
  const id = resolveIdentity(payload);
  if (!id) return null;

  const file = payload.messageData?.fileMessageData;
  // Media may arrive without downloadUrl — inbound pipeline resolves via downloadFile.
  const caption = file?.caption?.trim();
  const base = {
    messageId: payload.idMessage ?? `green-${Date.now()}`,
    senderId: id.senderId,
    senderPhone: id.senderPhone,
    chatId: id.chatId,
    direction: id.direction,
    mimeType: file?.mimeType,
    caption,
    text: caption,
    chatName: id.chatName,
  };

  if (mediaType === "audio") {
    return {
      ...base,
      type: "audio" as const,
      audioUrl: file?.downloadUrl?.trim() || undefined,
      mimeType: file?.mimeType ?? "audio/ogg",
    };
  }

  const fileName = file?.fileName ?? "";
  const mimeGuess =
    file?.mimeType ||
    (/\.png$/i.test(fileName)
      ? "image/png"
      : /\.webp$/i.test(fileName)
        ? "image/webp"
        : "image/jpeg");

  return {
    ...base,
    type: "image" as const,
    imageUrl: file?.downloadUrl?.trim() || undefined,
    mimeType: mimeGuess,
  };
}

export function parseGreenApiWebhook(body: unknown): {
  ignored: boolean;
  reason?: "not_inbound" | "not_capture_chat" | "no_sender";
  messages: ParsedGreenApiMessage[];
} {
  const payload = body as GreenApiWebhookPayload;
  const typeWebhook = payload.typeWebhook ?? "";

  if (!INGEST_WEBHOOKS.has(typeWebhook)) {
    return { ignored: true, reason: "not_inbound", messages: [] };
  }

  const chatId = payload.senderData?.chatId ?? payload.senderData?.sender ?? "";
  if (!chatId.trim()) {
    return { ignored: false, reason: "no_sender", messages: [] };
  }

  if (isBroadcastWhatsAppChat(chatId)) {
    return { ignored: true, reason: "not_inbound", messages: [] };
  }

  const typeMessage = payload.messageData?.typeMessage;

  if (typeMessage === "textMessage" || typeMessage === "extendedTextMessage") {
    const message = parseTextMessage(payload);
    return message
      ? { ignored: false, messages: [message] }
      : { ignored: false, reason: "not_capture_chat", messages: [] };
  }

  if (typeMessage === "audioMessage" || typeMessage === "pttMessage") {
    const message = parseFileMessage(payload, "audio");
    return message
      ? { ignored: false, messages: [message] }
      : { ignored: false, reason: "not_capture_chat", messages: [] };
  }

  if (typeMessage === "imageMessage") {
    const message = parseFileMessage(payload, "image");
    return message
      ? { ignored: false, messages: [message] }
      : { ignored: false, reason: "not_capture_chat", messages: [] };
  }

  if (typeMessage === "documentMessage") {
    const file = payload.messageData?.fileMessageData;
    const mimeType = file?.mimeType ?? "";
    const fileName = file?.fileName ?? "";
    const isImage =
      mimeType.startsWith("image/") ||
      /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(fileName);
    if (isImage) {
      const message = parseFileMessage(payload, "image");
      return message
        ? { ignored: false, messages: [message] }
        : { ignored: false, reason: "not_capture_chat", messages: [] };
    }
  }

  return { ignored: false, reason: "not_capture_chat", messages: [] };
}

export function verifyGreenApiWebhookAuth(
  request: Request,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  const bearer =
    authHeader?.startsWith("Bearer ") === true
      ? authHeader.slice("Bearer ".length)
      : undefined;
  const headerToken = request.headers.get("x-webhook-token");
  const queryToken = new URL(request.url).searchParams.get("token");

  return (
    bearer === expectedToken ||
    headerToken === expectedToken ||
    queryToken === expectedToken
  );
}

/** Lookup keys to try when matching stored user phones. */
export function phoneLookupVariants(phone: string): string[] {
  const normalized = normalizePhone(phone);
  const digits = normalized.replace(/\D/g, "");
  const variants = new Set<string>([normalized, digits, `+${digits}`]);

  if (digits.startsWith("972") && digits.length === 12) {
    variants.add(`0${digits.slice(3)}`);
    variants.add(`+972${digits.slice(3)}`);
  }
  if (digits.startsWith("972") && digits.length > 12) {
    const trimmed = digits.slice(0, 12);
    variants.add(trimmed);
    variants.add(`+${trimmed}`);
    variants.add(`0${trimmed.slice(3)}`);
  }

  return [...variants];
}

export const greenApiMediaType = {
  text: "text",
  audio: "audio",
  image: "image",
} as const;

export type GreenApiMediaType =
  (typeof greenApiMediaType)[keyof typeof greenApiMediaType];
