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
  fromOwner?: boolean;
}

export interface GreenApiWebhookPayload {
  typeWebhook?: string;
  idMessage?: string;
  instanceData?: { wid?: string; idInstance?: number | string };
  senderData?: {
    chatId?: string;
    sender?: string;
    senderPn?: string;
    chatName?: string;
    senderName?: string;
  };
  messageData?: {
    typeMessage?: string;
    textMessage?: string;
    textMessageData?: { textMessage?: string };
    extendedTextMessageData?: { text?: string; textMessage?: string };
    quotedMessage?: { textMessage?: string };
    editedMessage?: { typeMessage?: string; textMessage?: string; text?: string };
    editedMessageData?: { textMessage?: string; text?: string };
    buttonsResponseMessage?: { selectedButtonId?: string; selectedButtonText?: string };
    templateButtonReplyMessage?: { selectedId?: string };
    listResponseMessage?: { title?: string; selectedRowId?: string };
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

const TEXT_MESSAGE_TYPES = new Set([
  "textMessage",
  "extendedTextMessage",
  "quotedMessage",
  "editedMessage",
  "buttonsResponseMessage",
  "templateButtonReplyMessage",
  "listResponseMessage",
]);

export function unwrapGreenApiWebhook(body: unknown): GreenApiWebhookPayload {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  if (typeof record.typeWebhook === "string") {
    return record as GreenApiWebhookPayload;
  }
  const nested = record.body;
  if (
    nested &&
    typeof nested === "object" &&
    typeof (nested as { typeWebhook?: unknown }).typeWebhook === "string"
  ) {
    return nested as GreenApiWebhookPayload;
  }
  return record as GreenApiWebhookPayload;
}

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
    t.startsWith("BabiTk") ||
    t.startsWith("מידע חדש נכנס למערכת") ||
    t.includes("נכנסו למערכת BabaiTk") ||
    t.startsWith("נקלט פריט") ||
    t.startsWith("נקלטו ") ||
    t.startsWith("נפתחו ") ||
    t.startsWith("קלטתי") ||
    t.startsWith("לא הצלחתי לזהות") ||
    t.startsWith("חרגת ממכסת") ||
    t.startsWith("הגעת למכסת") ||
    t.startsWith("מספר הטלפון שלך לא מקושר") ||
    t.startsWith("הודעה יומית") ||
    t.startsWith("מספר שולח נוסף") ||
    t.startsWith("✓ בדיקת") ||
    t.startsWith("📋") ||
    t.startsWith("⏰ תזכורת") ||
    t.startsWith("🗓") ||
    t.startsWith("בוקר טוב") ||
    t.startsWith("אין משימות") ||
    t.startsWith("סומן כבוצע") ||
    t.startsWith("נדחה ל-") ||
    t.startsWith("עודכן ל-") ||
    t.startsWith("אפשר לשאול אותי") ||
    t.startsWith("בקבוצה הזו אפשר") ||
    t.startsWith("לא מצאתי פריט") ||
    t.startsWith("הפריט כבר לא") ||
    t.includes("השב:") ||
    t.includes("לא נרשם פריט")
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
  fromOwner: boolean;
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
  const senderPn = payload.senderData?.senderPn?.trim() ?? "";
  const outgoingFromInstance = direction === "outgoing";
  const chatIsGroup = isGroupWhatsAppChat(chatId);

  let fromOwner = false;
  if (outgoingFromInstance) {
    fromOwner = true;
  } else if (!senderRaw && !senderPn) {
    return null;
  } else if (senderPn) {
    fromOwner = isOwnerWhatsAppSender(senderPn, wid);
  } else if (isWhatsAppLidId(senderRaw)) {
    if (!chatIsGroup) return null;
    fromOwner = true;
  } else {
    fromOwner = isOwnerWhatsAppSender(senderRaw, wid);
  }

  const effectiveSender =
    !senderRaw || isWhatsAppLidId(senderRaw) ? senderPn || wid : senderRaw;

  const isGroup = chatIsGroup;
  const isSelfChat =
    isDirectWhatsAppChat(chatId) && isOwnerWhatsAppSender(chatId, wid);

  if (!isGroup && !(isSelfChat && outgoingFromInstance)) {
    return null;
  }

  return {
    chatId: isGroup ? normalizeGroupChatId(chatId) : chatId.trim().toLowerCase(),
    senderId: senderIdFromWhatsAppChatId(effectiveSender),
    senderPhone: phoneFromWhatsAppId(effectiveSender),
    direction,
    fromOwner,
    chatName:
      payload.senderData?.chatName?.trim() ||
      (isSelfChat ? "הודעה לעצמי" : undefined),
  };
}

function extractText(payload: GreenApiWebhookPayload): string | undefined {
  const messageData = payload.messageData;
  const candidates = [
    messageData?.textMessageData?.textMessage,
    messageData?.extendedTextMessageData?.text,
    messageData?.extendedTextMessageData?.textMessage,
    typeof messageData?.textMessage === "string" ? messageData.textMessage : undefined,
    messageData?.editedMessage?.textMessage,
    messageData?.editedMessage?.text,
    messageData?.editedMessageData?.textMessage,
    messageData?.editedMessageData?.text,
    messageData?.buttonsResponseMessage?.selectedButtonText,
    messageData?.buttonsResponseMessage?.selectedButtonId,
    messageData?.templateButtonReplyMessage?.selectedId,
    messageData?.listResponseMessage?.selectedRowId,
    messageData?.listResponseMessage?.title,
    messageData?.fileMessageData?.caption,
  ];
  for (const raw of candidates) {
    const text = raw?.trim();
    if (text) return text;
  }
  return undefined;
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
    fromOwner: id.fromOwner,
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
    fromOwner: id.fromOwner,
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
  const payload = unwrapGreenApiWebhook(body);
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

  if (
    (TEXT_MESSAGE_TYPES.has(typeMessage ?? "") || extractText(payload)) &&
    typeMessage !== "audioMessage" &&
    typeMessage !== "pttMessage" &&
    typeMessage !== "imageMessage"
  ) {
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
