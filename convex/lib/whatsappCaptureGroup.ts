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
