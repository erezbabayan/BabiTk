import { normalizePhone } from "../items.service.js";

/** Extract E.164 phone from WhatsApp chat ids like 972501234567@c.us */
export function phoneFromWhatsAppId(raw: string): string {
  const local = raw.split("@")[0]?.trim() ?? raw.trim();
  return normalizePhone(local);
}
