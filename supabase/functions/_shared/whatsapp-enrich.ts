import { enrichWhatsAppCapture, type CaptureRow } from "./proactive-whatsapp.ts";

function flag(name: string, defaultOn = false): boolean {
  const raw = Deno.env.get(name);
  if (raw === undefined || raw.trim() === "") return defaultOn;
  const value = raw.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes" || value === "on") return true;
  if (value === "0" || value === "false" || value === "no" || value === "off") return false;
  return defaultOn;
}

export function enrichInboundRows(
  text: string,
  rows: CaptureRow[],
  allowedTags: string[] = [],
): CaptureRow[] {
  return enrichWhatsAppCapture(text, rows, {
    multiCard: flag("WHATSAPP_MULTI_CARD", false),
    recurrence: flag("WHATSAPP_RECURRENCE", true),
    autoCategory: flag("WHATSAPP_AUTO_CATEGORY", false),
    allowedTags,
  });
}
