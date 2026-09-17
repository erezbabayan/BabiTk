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
  /** False for other group participants — Q&A is allowed, capture ingest is not. */
  fromOwner: boolean;
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
    };
  };
}

const INGEST_WEBHOOKS = new Set([
  "incomingMessageReceived",
  "outgoingMessageReceived",
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

/** Green-API HTTP notifications sometimes wrap the event in `{ receiptId, body }`. */
export function unwrapGreenApiWebhook(body: unknown): GreenApiWebhookPayload {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  if (typeof record.typeWebhook === "string") {
    return record as GreenApiWebhookPayload;
  }
  const nested = record.body;
  if (nested && typeof nested === "object" && typeof (nested as { typeWebhook?: unknown }).typeWebhook === "string") {
    return nested as GreenApiWebhookPayload;
  }
  return record as GreenApiWebhookPayload;
}

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
    // Linked-device posts into the capture group often arrive as incoming + @lid
    // from this instance session. Treat as owner so capture still works.
    fromOwner = true;
  } else {
    fromOwner = isOwnerWhatsAppSender(senderRaw, wid);
  }

  const effectiveSender =
    !senderRaw || isWhatsAppLidId(senderRaw) ? senderPn || wid : senderRaw;
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
  if (TEXT_MESSAGE_TYPES.has(typeMessage ?? "") || extractText(payload)) {
    if (
      typeMessage === "audioMessage" ||
      typeMessage === "pttMessage" ||
      typeMessage === "imageMessage"
    ) {
      // fall through to media parsers below
    } else {
      const message = parseTextMessage(payload);
      return message
        ? { ignored: false, messages: [message] }
        : { ignored: false, reason: "not_capture_chat", messages: [] };
    }
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

export function verifyGreenApiWebhookAuth(
  request: Request,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken) return true;
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
  const payload = unwrapGreenApiWebhook(body);
  const raw = payload.instanceData?.idInstance;
  if (raw === undefined || raw === null) return null;
  const id = String(raw).trim();
  return id.length > 0 ? id : null;
}
