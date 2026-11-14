/** Strip WhatsApp multi-device suffix (`972…:31`) and domain (`@c.us` / `@lid`). */
export function bareWhatsAppLocalId(raw: string): string {
  const local = raw.split("@")[0]?.trim() ?? raw.trim();
  return (local.split(":")[0] ?? local).trim();
}

/** Normalize to E.164 (Israeli local 0XXXXXXXXX → +972XXXXXXXXX). */
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

/** Extract E.164 phone from WhatsApp chat ids like 972501234567@c.us or 972…:31@c.us */
export function phoneFromWhatsAppId(raw: string): string {
  return normalizePhone(bareWhatsAppLocalId(raw));
}

/** Raw sender id before @c.us (Green-API chatId local part), without device suffix. */
export function senderIdFromWhatsAppChatId(raw: string): string {
  return bareWhatsAppLocalId(raw);
}
