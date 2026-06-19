import type {
  WhatsAppInboundMessage,
  WhatsAppProviderId,
  WhatsAppWebhookPayload,
} from "../../types/whatsapp.js";
import { phoneFromWhatsAppId } from "./phone.js";

function pushTextMessage(
  messages: WhatsAppInboundMessage[],
  base: Omit<WhatsAppInboundMessage, "type" | "text">,
  text: string | undefined,
): void {
  if (!text?.trim()) return;
  messages.push({ ...base, type: "text", text: text.trim() });
}

function pushAudioMessage(
  messages: WhatsAppInboundMessage[],
  base: Omit<WhatsAppInboundMessage, "type">,
  refs: { audioId?: string; audioUrl?: string; mimeType?: string },
): void {
  if (!refs.audioId && !refs.audioUrl) return;
  messages.push({
    ...base,
    type: "audio",
    audioId: refs.audioId,
    audioUrl: refs.audioUrl,
    mimeType: refs.mimeType,
  });
}

function pushImageMessage(
  messages: WhatsAppInboundMessage[],
  base: Omit<WhatsAppInboundMessage, "type">,
  refs: { imageId?: string; imageUrl?: string; mimeType?: string },
): void {
  if (!refs.imageId && !refs.imageUrl) return;
  messages.push({
    ...base,
    type: "image",
    imageId: refs.imageId,
    imageUrl: refs.imageUrl,
    mimeType: refs.mimeType,
  });
}

export function parseMetaWebhook(body: unknown): WhatsAppWebhookPayload {
  const messages: WhatsAppInboundMessage[] = [];

  const payload = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            id: string;
            from: string;
            type: string;
            text?: { body?: string };
            audio?: { id?: string; mime_type?: string };
            image?: { id?: string; mime_type?: string };
          }>;
        };
      }>;
    }>;
  };

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        const base = {
          id: message.id,
          from: phoneFromWhatsAppId(message.from),
          provider: "meta" as const,
        };

        if (message.type === "text") {
          pushTextMessage(messages, base, message.text?.body);
          continue;
        }

        if (message.type === "audio") {
          pushAudioMessage(messages, base, {
            audioId: message.audio?.id,
            mimeType: message.audio?.mime_type,
          });
          continue;
        }

        if (message.type === "image") {
          pushImageMessage(messages, base, {
            imageId: message.image?.id,
            mimeType: message.image?.mime_type,
          });
        }
      }
    }
  }

  return { messages };
}

export function parseGreenApiWebhook(body: unknown): WhatsAppWebhookPayload {
  const messages: WhatsAppInboundMessage[] = [];
  const payload = body as {
    typeWebhook?: string;
    idMessage?: string;
    senderData?: { chatId?: string; sender?: string };
    messageData?: {
      typeMessage?: string;
      textMessageData?: { textMessage?: string };
      fileMessageData?: {
        downloadUrl?: string;
        mimeType?: string;
      };
    };
  };

  if (payload.typeWebhook !== "incomingMessageReceived") {
    return { messages };
  }

  const chatId = payload.senderData?.chatId ?? payload.senderData?.sender ?? "";
  const base = {
    id: payload.idMessage ?? `green-${Date.now()}`,
    from: phoneFromWhatsAppId(chatId),
    provider: "green-api" as const,
  };

  const typeMessage = payload.messageData?.typeMessage;

  if (typeMessage === "textMessage") {
    pushTextMessage(messages, base, payload.messageData?.textMessageData?.textMessage);
    return { messages };
  }

  if (typeMessage === "audioMessage") {
    const file = payload.messageData?.fileMessageData;
    pushAudioMessage(messages, base, {
      audioUrl: file?.downloadUrl,
      mimeType: file?.mimeType ?? "audio/ogg",
    });
    return { messages };
  }

  if (typeMessage === "imageMessage") {
    const file = payload.messageData?.fileMessageData;
    pushImageMessage(messages, base, {
      imageUrl: file?.downloadUrl,
      mimeType: file?.mimeType ?? "image/jpeg",
    });
  }

  return { messages };
}

export function parseWhapiWebhook(body: unknown): WhatsAppWebhookPayload {
  const messages: WhatsAppInboundMessage[] = [];
  const payload = body as {
    messages?: Array<{
      id?: string;
      from_me?: boolean;
      type?: string;
      from?: string;
      chat_id?: string;
      text?: { body?: string };
      voice?: { link?: string; mime_type?: string };
      audio?: { link?: string; mime_type?: string };
      image?: { link?: string; mime_type?: string };
      link_preview?: { body?: string };
    }>;
  };

  for (const message of payload.messages ?? []) {
    if (message.from_me) continue;

    const fromRaw = message.from ?? message.chat_id ?? "";
    const base = {
      id: message.id ?? `whapi-${Date.now()}`,
      from: phoneFromWhatsAppId(fromRaw),
      provider: "whapi" as const,
    };

    const type = message.type ?? "unknown";

    if (type === "text" || type === "link_preview") {
      const text =
        message.text?.body ??
        (type === "link_preview" ? message.link_preview?.body : undefined);
      pushTextMessage(messages, base, text);
      continue;
    }

    if (type === "voice" || type === "audio") {
      const media = message.voice ?? message.audio;
      pushAudioMessage(messages, base, {
        audioUrl: media?.link,
        mimeType: media?.mime_type ?? "audio/ogg",
      });
      continue;
    }

    if (type === "image") {
      pushImageMessage(messages, base, {
        imageUrl: message.image?.link,
        mimeType: message.image?.mime_type ?? "image/jpeg",
      });
    }
  }

  return { messages };
}

/** Simplified tutorial / generic provider shape */
export function parseGenericWebhook(body: unknown): WhatsAppWebhookPayload {
  const messages: WhatsAppInboundMessage[] = [];
  const payload = body as {
    message?: {
      id?: string;
      sender_id?: string;
      from?: string;
      type?: string;
      text?: { body?: string };
      audio?: { url?: string; mime_type?: string };
      voice?: { url?: string; link?: string; mime_type?: string };
      image?: { url?: string; link?: string; mime_type?: string };
    };
  };

  const message = payload.message;
  if (!message) return { messages };

  const fromRaw = message.sender_id ?? message.from ?? "";
  const base = {
    id: message.id ?? `generic-${Date.now()}`,
    from: phoneFromWhatsAppId(fromRaw),
    provider: "whapi" as const,
  };

  const type = message.type ?? "text";

  if (type === "text") {
    pushTextMessage(messages, base, message.text?.body);
    return { messages };
  }

  if (type === "audio" || type === "voice") {
    const audio = message.audio ?? message.voice;
    pushAudioMessage(messages, base, {
      audioUrl: audio?.url ?? audio?.link,
      mimeType: audio?.mime_type ?? "audio/ogg",
    });
    return { messages };
  }

  if (type === "image") {
    pushImageMessage(messages, base, {
      imageUrl: message.image?.url ?? message.image?.link,
      mimeType: message.image?.mime_type ?? "image/jpeg",
    });
  }

  return { messages };
}

export function detectWebhookProvider(body: unknown): WhatsAppProviderId | "generic" | null {
  const payload = body as Record<string, unknown>;

  if (Array.isArray(payload.entry)) return "meta";
  if (payload.typeWebhook === "incomingMessageReceived") return "green-api";
  if (Array.isArray(payload.messages)) return "whapi";
  if (payload.message && typeof payload.message === "object") return "generic";
  return null;
}

export function parseInboundWebhook(
  body: unknown,
  providerHint?: WhatsAppProviderId | "generic",
): WhatsAppWebhookPayload {
  const detected = providerHint ?? detectWebhookProvider(body);

  switch (detected) {
    case "meta":
      return parseMetaWebhook(body);
    case "green-api":
      return parseGreenApiWebhook(body);
    case "whapi":
      return parseWhapiWebhook(body);
    case "generic":
      return parseGenericWebhook(body);
    default:
      return { messages: [] };
  }
}
