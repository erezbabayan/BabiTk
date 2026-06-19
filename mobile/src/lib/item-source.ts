import type { MindtaskerItem } from "./supabase";

const SOURCE_ICONS: Record<string, string> = {
  whatsapp_voice: "🎙️",
  whatsapp_text: "💬",
  notebook_ocr: "📷",
};

export const SOURCE_LABELS: Record<string, string> = {
  whatsapp_voice: "הקלטה קולית",
  whatsapp_text: "וואטסאפ",
  notebook_ocr: "סריקת מחברת",
};

export interface ResolvedItemSource {
  type: string;
  icon: string;
  label: string;
  canOpen: boolean;
}

export function resolveItemSource(item: MindtaskerItem): ResolvedItemSource {
  const material = item.source_materials ?? null;

  if (material) {
    return {
      type: material.source_type,
      icon: SOURCE_ICONS[material.source_type] ?? "💬",
      label: SOURCE_LABELS[material.source_type] ?? material.source_type,
      canOpen: true,
    };
  }

  if (item.source_material_id) {
    return {
      type: "whatsapp_text",
      icon: SOURCE_ICONS.whatsapp_text,
      label: SOURCE_LABELS.whatsapp_text,
      canOpen: true,
    };
  }

  const fallbackText = [item.content, item.title].find((t) => t.trim().length > 0) ?? "";

  return {
    type: "whatsapp_text",
    icon: SOURCE_ICONS.whatsapp_text,
    label: SOURCE_LABELS.whatsapp_text,
    canOpen: fallbackText.length > 0,
  };
}
