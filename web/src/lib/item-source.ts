import type { NotebookIconName } from "../components/NotebookIcons";
import type { MindtaskerItem, SourceMaterial } from "../types";
import {
  displayForSourceType,
  MANUAL_SOURCE_DISPLAY,
  type SourceType,
  SOURCE_ICONS,
  SOURCE_LABELS,
} from "./source-display";

export type DisplaySourceType = SourceType;

export { SOURCE_LABELS, SOURCE_ICONS };

export interface ResolvedItemSource {
  type: DisplaySourceType;
  icon: NotebookIconName;
  label: string;
  material: SourceMaterial | null;
  rawText: string | null;
  canOpen: boolean;
}

function resolveFromType(type: SourceType, material: SourceMaterial | null, rawText: string | null): ResolvedItemSource {
  const display = displayForSourceType(type);
  return {
    type,
    icon: display.icon,
    label: display.label,
    material,
    rawText,
    canOpen: true,
  };
}

export function resolveItemSource(item: MindtaskerItem): ResolvedItemSource {
  const material = item.source_materials ?? null;

  if (material) {
    return resolveFromType(material.source_type, material, material.raw_text);
  }

  if (item.source_material_id) {
    return resolveFromType("whatsapp_text", null, item.content || item.title);
  }

  const fallbackText = [item.content, item.title].find((t) => t.trim().length > 0) ?? "";

  if (!fallbackText) {
    return {
      type: "typed_text",
      icon: MANUAL_SOURCE_DISPLAY.icon,
      label: MANUAL_SOURCE_DISPLAY.label,
      material: null,
      rawText: null,
      canOpen: false,
    };
  }

  return {
    type: "typed_text",
    icon: MANUAL_SOURCE_DISPLAY.icon,
    label: MANUAL_SOURCE_DISPLAY.label,
    material: {
      id: `inline-${item.id}`,
      source_type: "typed_text",
      storage_url: null,
      raw_text: fallbackText,
    },
    rawText: fallbackText,
    canOpen: true,
  };
}
