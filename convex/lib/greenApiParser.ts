import { normalizePhone, phoneFromWhatsAppId, senderIdFromWhatsAppChatId } from "./phone";

export type GreenApiMessageType = "text" | "audio" | "image" | "unsupported";

export interface ParsedGreenApiMessage {
  messageId: string;
  senderId: string;
  senderPhone: string;
  type: GreenApiMessageType;
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
  mimeType?: string;
}

export interface GreenApiWebhookPayload {
  typeWebhook?: string;
  idMessage?: string;
  senderData?: { chatId?: string; sender?: string };
  messageData?: {
    typeMessage?: string;
    textMessageData?: { textMessage?: string };
    extendedTextMessageData?: { text?: string };
    fileMessageData?: {
      downloadUrl?: string;
      mimeType?: string;
    };
  };
}

/** Only 1:1 WhatsApp chats — skip groups (@g.us) and broadcasts. */
export function isDirectWhatsAppChat(chatId: string): boolean {
  const trimmed = chatId.trim();
  if (!trimmed) return false;
  if (trimmed.endsWith("@g.us") || trimmed.endsWith("@broadcast")) {
    return false;
  }
  return trimmed.endsWith("@c.us") || !trimmed.includes("@");
}

export function extractGreenApiSenderId(body: unknown): string | null {
  const payload = body as GreenApiWebhookPayload;
  const raw = payload.senderData?.chatId ?? payload.senderData?.sender;
  if (!raw?.trim()) return null;
  return senderIdFromWhatsAppChatId(raw);
}

function parseSenderFromPayload(payload: GreenApiWebhookPayload): {
  chatId: string;
  senderId: string;
  senderPhone: string;
} | null {
  const chatId = payload.senderData?.chatId ?? payload.senderData?.sender ?? "";
  if (!chatId.trim() || !isDirectWhatsAppChat(chatId)) {
    return null;
  }

  return {
    chatId,
    senderId: senderIdFromWhatsAppChatId(chatId),
    senderPhone: phoneFromWhatsAppId(chatId),
  };
}

function parseTextMessage(
  payload: GreenApiWebhookPayload,
): ParsedGreenApiMessage | null {
  const sender = parseSenderFromPayload(payload);
  if (!sender) return null;

  const typeMessage = payload.messageData?.typeMessage;
  let text: string | undefined;

  if (typeMessage === "textMessage") {
    text = payload.messageData?.textMessageData?.textMessage?.trim();
  } else if (typeMessage === "extendedTextMessage") {
    text = payload.messageData?.extendedTextMessageData?.text?.trim();
  }

  if (!text) return null;

  return {
    messageId: payload.idMessage ?? `green-${Date.now()}`,
    senderId: sender.senderId,
    senderPhone: sender.senderPhone,
    type: "text",
    text,
  };
}

function parseFileMessage(
  payload: GreenApiWebhookPayload,
  mediaType: "audio" | "image",
): ParsedGreenApiMessage | null {
  const sender = parseSenderFromPayload(payload);
  if (!sender) return null;

  const file = payload.messageData?.fileMessageData;
  if (!file?.downloadUrl) return null;

  const base = {
    messageId: payload.idMessage ?? `green-${Date.now()}`,
    senderId: sender.senderId,
    senderPhone: sender.senderPhone,
    mimeType: file.mimeType,
  };

  if (mediaType === "audio") {
    return {
      ...base,
      type: "audio",
      audioUrl: file.downloadUrl,
      mimeType: file.mimeType ?? "audio/ogg",
    };
  }

  return {
    ...base,
    type: "image",
    imageUrl: file.downloadUrl,
    mimeType: file.mimeType ?? "image/jpeg",
  };
}

export function parseGreenApiWebhook(body: unknown): {
  ignored: boolean;
  reason?: "not_inbound" | "group_chat" | "no_sender";
  messages: ParsedGreenApiMessage[];
} {
  const payload = body as GreenApiWebhookPayload;

  if (payload.typeWebhook !== "incomingMessageReceived") {
    return { ignored: true, reason: "not_inbound", messages: [] };
  }

  const chatId = payload.senderData?.chatId ?? payload.senderData?.sender ?? "";
  if (!chatId.trim()) {
    return { ignored: false, reason: "no_sender", messages: [] };
  }

  if (!isDirectWhatsAppChat(chatId)) {
    return { ignored: true, reason: "group_chat", messages: [] };
  }

  const typeMessage = payload.messageData?.typeMessage;

  if (typeMessage === "textMessage" || typeMessage === "extendedTextMessage") {
    const message = parseTextMessage(payload);
    return message
      ? { ignored: false, messages: [message] }
      : { ignored: false, messages: [] };
  }

  if (typeMessage === "audioMessage") {
    const message = parseFileMessage(payload, "audio");
    return message
      ? { ignored: false, messages: [message] }
      : { ignored: false, messages: [] };
  }

  if (typeMessage === "imageMessage") {
    const message = parseFileMessage(payload, "image");
    return message
      ? { ignored: false, messages: [message] }
      : { ignored: false, messages: [] };
  }

  if (typeMessage === "documentMessage") {
    const mimeType = payload.messageData?.fileMessageData?.mimeType ?? "";
    if (mimeType.startsWith("image/")) {
      const message = parseFileMessage(payload, "image");
      return message
        ? { ignored: false, messages: [message] }
        : { ignored: false, messages: [] };
    }
  }

  const sender = parseSenderFromPayload(payload);
  if (!sender) {
    return { ignored: false, messages: [] };
  }

  return {
    ignored: false,
    messages: [
      {
        messageId: payload.idMessage ?? `green-${Date.now()}`,
        senderId: sender.senderId,
        senderPhone: sender.senderPhone,
        type: "unsupported",
      },
    ],
  };
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
