import crypto from "node:crypto";
import { env } from "../config/env.js";

const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji}\s]+$/u;

export interface SanitizeResult {
  accepted: boolean;
  reason?:
    | "too_short"
    | "emoji_only"
    | "sticker"
    | "unsupported_type"
    | "empty";
}

export function verifyWhatsAppSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  if (!env.whatsappAppSecret) {
    return false;
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", env.whatsappAppSecret)
    .update(rawBody)
    .digest("hex");

  const received = signatureHeader.slice("sha256=".length);

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(received, "utf8"),
    );
  } catch {
    return false;
  }
}

export function sanitizeInboundText(text: string | undefined): SanitizeResult {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) {
    return { accepted: false, reason: "empty" };
  }
  if (trimmed.length < 3) {
    return { accepted: false, reason: "too_short" };
  }
  if (EMOJI_ONLY.test(trimmed)) {
    return { accepted: false, reason: "emoji_only" };
  }
  return { accepted: true };
}

export function sanitizeInboundType(type: string | undefined): SanitizeResult {
  if (!type) {
    return { accepted: false, reason: "unsupported_type" };
  }

  if (type === "sticker") {
    return { accepted: false, reason: "sticker" };
  }

  const allowed = new Set(["text", "audio", "image"]);
  if (!allowed.has(type)) {
    return { accepted: false, reason: "unsupported_type" };
  }

  return { accepted: true };
}

export const WHATSAPP_REJECTION_MESSAGE =
  "לא הצלחתי לזהות משימה או הערה בהודעה זו.";
