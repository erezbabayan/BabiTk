/** Green-API webhook parsing — port of convex/lib/greenApiParser.ts for Edge Functions. */

export type GreenApiMessageType = "text" | "audio" | "image" | "unsupported";

export interface ParsedGreenApiMessage {
  messageId: string;
  senderId: string;
  senderPhone: string;
  chatId: string;
  direction: "incoming" | "outgoing";
  type: GreenApiMessageType;
  text?: string;
  audioUrl?: string;
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
    };
  };
}

const INGEST_WEBHOOKS = new Set([
  "incomingMessageReceived",
  "outgoingMessageReceived",
]);

export function bareWhatsAppLocalId(raw: string): string {
  const local = raw.split("@")[0]?.trim() ?? raw.trim();
  return (local.split(":")[0] ?? local).trim();
}

export function normalizePhone(phone: string): string {
  const bare = bareWhatsAppLocalId(phone);
  const digits = bare.replace(/\D/g, "");
  if (bare.startsWith("+") || phone.trim().startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `+972${digits.slice(1)}`;
  }
  return `+${digits}`;
}

export function phoneFromWhatsAppId(raw: string): string {
  return normalizePhone(bareWhatsAppLocalId(raw));
}

export function senderIdFromWhatsAppChatId(raw: string): string {
  return bareWhatsAppLocalId(raw);
}

export function normalizeGroupChatId(chatId: string): string {
  return chatId.trim().toLowerCase();
}

export function isGroupWhatsAppChat(chatId: string): boolean {
  return chatId.trim().endsWith("@g.us");
}

export function isWhatsAppLidId(id: string): boolean {
  return id.trim().toLowerCase().endsWith("@lid");
}

export function isPersonalWhatsAppChat(chatId: string): boolean {
  return chatId.trim().toLowerCase().endsWith("@c.us");
}

export function isBroadcastWhatsAppChat(chatId: string): boolean {
  return chatId.trim().endsWith("@broadcast");
}

export function isDirectWhatsAppChat(chatId: string): boolean {
  const trimmed = chatId.trim();
  if (!trimmed) return false;
  if (isGroupWhatsAppChat(trimmed) || isBroadcastWhatsAppChat(trimmed)) {
    return false;
  }
  return trimmed.endsWith("@c.us") || trimmed.endsWith("@lid") || !trimmed.includes("@");
}

export function personalCaptureChatId(phone: string | undefined | null): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `${digits}@c.us`;
}

function digitsOf(id: string): string {
  return phoneFromWhatsAppId(id).replace(/\D/g, "");
}

export function isOwnerWhatsAppSender(senderPhoneOrId: string, instanceWid: string): boolean {
  if (isWhatsAppLidId(senderPhoneOrId) || isWhatsAppLidId(instanceWid)) {
    return false;
  }
  const sender = digitsOf(senderPhoneOrId);
  const owner = digitsOf(instanceWid);
  return sender.length >= 10 && owner.length >= 10 && sender === owner;
}

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
  const outgoingFromInstance = direction === "outgoing";
  const chatIsGroup = isGroupWhatsAppChat(chatId);

  if (outgoingFromInstance) {
    // accept
  } else if (!senderRaw) {
    return null;
  } else if (isWhatsAppLidId(senderRaw)) {
    if (!chatIsGroup) return null;
  } else if (!isOwnerWhatsAppSender(senderRaw, wid)) {
    return null;
  }

  const effectiveSender = !senderRaw || isWhatsAppLidId(senderRaw) ? wid : senderRaw;
  const isSelfChat =
    isDirectWhatsAppChat(chatId) && isOwnerWhatsAppSender(chatId, wid);

  if (!chatIsGroup && !(isSelfChat && outgoingFromInstance)) {
    return null;
  }

  return {
    chatId: chatIsGroup ? normalizeGroupChatId(chatId) : chatId.trim().toLowerCase(),
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
  return payload.messageData?.fileMessageData?.caption?.trim() || undefined;
}

function parseTextMessage(payload: GreenApiWebhookPayload): ParsedGreenApiMessage | null {
  const id = resolveIdentity(payload);
  if (!id) return null;
  const text = extractText(payload);
  if (!text || isSystemWhatsAppReply(text)) return null;
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
      type: "audio",
      audioUrl: file?.downloadUrl?.trim() || undefined,
      mimeType: file?.mimeType ?? "audio/ogg",
    };
  }
  return {
    ...base,
    type: "image",
    imageUrl: file?.downloadUrl?.trim() || undefined,
    mimeType: file?.mimeType || "image/jpeg",
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
  return { ignored: false, reason: "not_capture_chat", messages: [] };
}

function secretEquals(
  received: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (typeof expected !== "string" || expected.length === 0) return false;
  if (typeof received !== "string") return false;
  const max = Math.max(received.length, expected.length);
  let mismatch = received.length === expected.length ? 0 : 1;
  for (let i = 0; i < max; i++) {
    mismatch |= (received.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

export function verifyGreenApiWebhookAuth(
  request: Request,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken) return false;
  const authHeader = request.headers.get("authorization");
  const bearer =
    authHeader?.startsWith("Bearer ") === true
      ? authHeader.slice("Bearer ".length)
      : undefined;
  const headerToken = request.headers.get("x-webhook-token");
  return (
    secretEquals(bearer, expectedToken) || secretEquals(headerToken, expectedToken)
  );
}

export function phoneLookupVariants(phone: string): string[] {
  const normalized = normalizePhone(phone);
  const digits = normalized.replace(/\D/g, "");
  const variants = new Set<string>([normalized, digits, `+${digits}`]);
  if (digits.startsWith("972") && digits.length === 12) {
    variants.add(`0${digits.slice(3)}`);
    variants.add(`+972${digits.slice(3)}`);
  }
  return [...variants];
}

export function instanceIdFromPayload(body: unknown): string | null {
  const payload = body as GreenApiWebhookPayload;
  const raw = payload.instanceData?.idInstance;
  if (raw === undefined || raw === null) return null;
  const id = String(raw).trim();
  return id.length > 0 ? id : null;
}
