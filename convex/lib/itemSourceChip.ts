/**
 * Which source chip an item card shows (top-left, next to the headline).
 *
 * - "babisnap": device voice-ingest (BabiSnap / Raspberry Pi / Tasker) — unchanged logic.
 * - "whatsapp": anything that arrived through WhatsApp (text, voice, image/OCR from a chat).
 * - "babitk": created inside BabiTk (typed in web/app, recorded in the app, app image upload).
 * - null: unknown/other sources keep showing no chip.
 */
import { isDeviceVoiceItem } from "./deviceVoiceChip";

export type ItemSourceChipKind = "babisnap" | "whatsapp" | "babitk";

export const WHATSAPP_CHIP_LABEL = "WhatsApp";
export const BABITK_CHIP_LABEL = "BabiTk";

/** metadata.source values written by BabiTk's own capture flows. */
const IN_APP_SOURCES = new Set(["typed_text", "app_voice", "notebook_ocr", "document"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isWhatsAppSource(source: string): boolean {
  return source === "whatsapp" || source.startsWith("whatsapp_");
}

function materialSourceType(sourceMaterials: unknown): string {
  const material = Array.isArray(sourceMaterials) ? sourceMaterials[0] : sourceMaterials;
  return str(record(material)?.source_type);
}

export function itemSourceChip(item: {
  metadata?: unknown;
  source_materials?: unknown;
}): ItemSourceChipKind | null {
  if (isDeviceVoiceItem(item)) return "babisnap";
  const metadata = record(item.metadata);
  const source = str(metadata?.source);
  if (isWhatsAppSource(source)) return "whatsapp";
  // WhatsApp image/OCR items carry the originating chat message.
  if (str(metadata?.whatsapp_message_id) || str(metadata?.channel) === "whatsapp") {
    return "whatsapp";
  }
  if (IN_APP_SOURCES.has(source)) return "babitk";
  if (source) return null;
  // Legacy rows without metadata.source: fall back to the stored source material.
  const materialType = materialSourceType(item.source_materials);
  if (isWhatsAppSource(materialType)) return "whatsapp";
  if (materialType === "typed_text") return "babitk";
  return null;
}
