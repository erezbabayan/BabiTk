/** Strip WhatsApp multi-device suffix and domain. */
export function bareWhatsAppLocalId(raw: string): string {
  const local = raw.split("@")[0]?.trim() ?? raw.trim();
  return (local.split(":")[0] ?? local).trim();
}

/** Normalize to E.164 (Israeli local 0XXXXXXXXX → +972XXXXXXXXX). */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const bare = bareWhatsAppLocalId(trimmed);
  const digits = bare.replace(/\D/g, "");
  if (digits.length < 9) {
    throw new Error("מספר טלפון לא תקין");
  }
  if (trimmed.startsWith("+") || bare.startsWith("+")) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `+972${digits.slice(1)}`;
  }
  if (digits.startsWith("972")) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

export function personalCaptureChatId(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `${digits}@c.us`;
}
