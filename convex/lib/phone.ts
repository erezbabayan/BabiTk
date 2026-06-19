/** Normalize to E.164 (Israeli local 0XXXXXXXXX → +972XXXXXXXXX). */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (phone.startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `+972${digits.slice(1)}`;
  }
  return `+${digits}`;
}

/** Extract E.164 phone from WhatsApp chat ids like 972501234567@c.us */
export function phoneFromWhatsAppId(raw: string): string {
  const local = raw.split("@")[0]?.trim() ?? raw.trim();
  return normalizePhone(local);
}

/** Raw sender id before @c.us (Green-API chatId local part). */
export function senderIdFromWhatsAppChatId(raw: string): string {
  return raw.split("@")[0]?.trim() ?? raw.trim();
}
