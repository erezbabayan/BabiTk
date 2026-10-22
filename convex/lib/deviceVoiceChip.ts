/** Tasks created by the device voice-ingest endpoint, not WhatsApp or in-app recording. */

export const DEVICE_VOICE_CHIP_LABEL = "🎙️ מהכפתור";

const WHATSAPP_SOURCES = new Set(["whatsapp_voice", "whatsapp_text", "whatsapp"]);
const IN_APP_VOICE_SOURCE = "app_voice";
const DEVICE_VOICE_SOURCE = "voice";

function metadataSource(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const source = (metadata as Record<string, unknown>).source;
  return typeof source === "string" ? source : "";
}

function materialSourceType(sourceMaterials: unknown): string {
  const material = Array.isArray(sourceMaterials) ? sourceMaterials[0] : sourceMaterials;
  if (!material || typeof material !== "object") return "";
  const sourceType = (material as { source_type?: unknown }).source_type;
  return typeof sourceType === "string" ? sourceType : "";
}

export function isDeviceVoiceItem(item: {
  metadata?: unknown;
  source_materials?: unknown;
}): boolean {
  const source = metadataSource(item.metadata);
  if (source === IN_APP_VOICE_SOURCE || WHATSAPP_SOURCES.has(source)) return false;
  if (source === DEVICE_VOICE_SOURCE) return true;
  return materialSourceType(item.source_materials) === DEVICE_VOICE_SOURCE;
}
