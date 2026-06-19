import type { MindtaskerItem, SourceMaterial, SourceType } from "../types";
import { SOURCE_ICONS } from "../types";

export type DisplaySourceType = SourceType;

export const SOURCE_LABELS: Record<DisplaySourceType, string> = {
  whatsapp_voice: "הקלטה קולית",
  whatsapp_text: "וואטסאפ",
  notebook_ocr: "סריקת מחברת",
};

export interface ResolvedItemSource {
  type: DisplaySourceType;
  icon: string;
  label: string;
  material: SourceMaterial | null;
  rawText: string | null;
  canOpen: boolean;
}

export function resolveItemSource(item: MindtaskerItem): ResolvedItemSource {
  const material = item.source_materials ?? null;

  if (material) {
    return {
      type: material.source_type,
      icon: SOURCE_ICONS[material.source_type],
      label: SOURCE_LABELS[material.source_type],
      material,
      rawText: material.raw_text,
      canOpen: true,
    };
  }

  if (item.source_material_id) {
    return {
      type: "whatsapp_text",
      icon: SOURCE_ICONS.whatsapp_text,
      label: SOURCE_LABELS.whatsapp_text,
      material: null,
      rawText: item.content || item.title,
      canOpen: true,
    };
  }

  const fallbackText = [item.content, item.title].find((t) => t.trim().length > 0) ?? "";

  return {
    type: "whatsapp_text",
    icon: SOURCE_ICONS.whatsapp_text,
    label: SOURCE_LABELS.whatsapp_text,
    material: fallbackText
      ? {
          id: `inline-${item.id}`,
          source_type: "whatsapp_text",
          storage_url: null,
          raw_text: fallbackText,
        }
      : null,
    rawText: fallbackText || null,
    canOpen: fallbackText.length > 0,
  };
}
