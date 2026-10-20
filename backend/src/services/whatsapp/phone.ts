import { normalizePhone } from "../items.service.js";

/** Extract E.164 phone from WhatsApp chat ids like 972501234567@c.us or 972…:31@c.us */
export function phoneFromWhatsAppId(raw: string): string {
  return normalizePhone(raw);
}
