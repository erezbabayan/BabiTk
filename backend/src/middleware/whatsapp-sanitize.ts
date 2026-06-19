import type { WhatsAppInboundMessage } from "../services/whatsapp.service.js";
import {
  sanitizeInboundText,
  type SanitizeResult,
} from "../utils/whatsapp.js";

const ALLOWED_TYPES = new Set(["text", "audio", "image"]);

const BLOCKED_TYPES = new Set([
  "sticker",
  "video",
  "document",
  "location",
  "contacts",
  "reaction",
  "interactive",
  "button",
  "order",
  "system",
  "unknown",
]);

/**
 * Pre-AI sanitization for inbound WhatsApp messages.
 * Blocks junk before any Whisper / Vision / parse pipeline runs.
 */
export function sanitizeWhatsAppMessage(
  message: WhatsAppInboundMessage,
): SanitizeResult {
  if (!message.type || BLOCKED_TYPES.has(message.type)) {
    return {
      accepted: false,
      reason: message.type === "sticker" ? "sticker" : "unsupported_type",
    };
  }

  if (!ALLOWED_TYPES.has(message.type)) {
    return { accepted: false, reason: "unsupported_type" };
  }

  if (message.type === "text") {
    return sanitizeInboundText(message.text);
  }

  if (message.type === "audio") {
    if (!message.audioId && !message.audioUrl) {
      return { accepted: false, reason: "unsupported_type" };
    }
    return { accepted: true };
  }

  if (message.type === "image") {
    if (!message.imageId && !message.imageUrl) {
      return { accepted: false, reason: "unsupported_type" };
    }
    return { accepted: true };
  }

  return { accepted: false, reason: "unsupported_type" };
}

export function isWhatsAppJunkMessage(message: WhatsAppInboundMessage): boolean {
  return !sanitizeWhatsAppMessage(message).accepted;
}
