import { phoneFromWhatsAppId } from "./phone";

/** Normalize WhatsApp group chat id (`120363…@g.us`). */
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

export function isDefaultPersonalCaptureName(name: string | null | undefined): boolean {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return (
    trimmed.includes("הודעה לעצמי") ||
    lower.includes("babitk") ||
    lower.includes("message yourself")
  );
}

export function isNamedMessageYourselfChat(chatName?: string): boolean {
  const name = chatName?.trim() ?? "";
  if (!name) return false;
  const lower = name.toLowerCase();
  return (
    name.includes("הודעה לעצמי") ||
    lower.includes("message yourself") ||
    lower.includes("babitk")
  );
}

export type CaptureGateUser = {
  phone?: string | null;
  captureGroupChatId?: string | null;
  captureGroupName?: string | null;
};

export type CaptureGateDecision =
  | { allowed: true; bind?: { chatId: string; name: string | null } }
  | { allowed: false; reason: string };

/**
 * Fail-closed when no capture chat is configured: only the owner's
 * Message Yourself / personal chat may auto-bind. Random groups and 1:1
 * peers are rejected until the user picks a group in settings.
 */
export function evaluateCaptureGate(
  user: CaptureGateUser,
  chatId: string,
  chatName?: string,
): CaptureGateDecision {
  const incoming = normalizeGroupChatId(chatId);
  const configured = user.captureGroupChatId?.trim() ?? "";
  const configuredName = user.captureGroupName?.trim() ?? "";
  const personalId = personalCaptureChatId(user.phone);

  if (configuredName && chatName?.trim() && configuredName === chatName.trim()) {
    if (normalizeGroupChatId(configured) !== incoming) {
      return { allowed: true, bind: { chatId: incoming, name: configuredName } };
    }
    return { allowed: true };
  }

  if (!configured) {
    const personalMatch = personalId
      ? normalizeGroupChatId(personalId) === incoming
      : false;
    if (personalMatch || (isPersonalWhatsAppChat(incoming) && isNamedMessageYourselfChat(chatName))) {
      return {
        allowed: true,
        bind: {
          chatId: incoming,
          name: chatName?.trim() || configuredName || "הודעה לעצמי",
        },
      };
    }
    return { allowed: false, reason: "capture_group_not_set" };
  }

  const configuredNorm = normalizeGroupChatId(configured);
  if (configuredNorm === incoming) {
    return { allowed: true };
  }

  if (
    isGroupWhatsAppChat(configuredNorm) &&
    personalId &&
    normalizeGroupChatId(personalId) === incoming
  ) {
    return { allowed: true };
  }

  // Connect stores a personal @c.us chat until the first group post.
  // Settings can save a custom group name without the @g.us id — still bind.
  if (isPersonalWhatsAppChat(configuredNorm) && isGroupWhatsAppChat(incoming)) {
    return {
      allowed: true,
      bind: {
        chatId: incoming,
        name: chatName?.trim() || configuredName || "קבוצת קליטה",
      },
    };
  }

  return { allowed: false, reason: "wrong_capture_group" };
}

/** Personal Message Yourself chat id for a stored E.164 / raw phone. */
export function personalCaptureChatId(phone: string | undefined | null): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `${digits}@c.us`;
}

function digitsOf(id: string): string {
  return phoneFromWhatsAppId(id).replace(/\D/g, "");
}

/** True when the message sender is the Green-API linked phone (the account owner). */
export function isOwnerWhatsAppSender(
  senderPhoneOrId: string,
  instanceWid: string,
): boolean {
  if (isWhatsAppLidId(senderPhoneOrId) || isWhatsAppLidId(instanceWid)) {
    return false;
  }
  const sender = digitsOf(senderPhoneOrId);
  const owner = digitsOf(instanceWid);
  return sender.length >= 10 && owner.length >= 10 && sender === owner;
}
