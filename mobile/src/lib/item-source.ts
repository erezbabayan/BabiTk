import type { MindtaskerItem } from "./supabase";
import type { NotebookIconName } from "../components/NotebookIcons";
import {
  displayForSourceType,
  MANUAL_SOURCE_DISPLAY,
  type SourceType,
  SOURCE_ICONS,
  SOURCE_LABELS,
} from "./source-display";

export { SOURCE_LABELS, SOURCE_ICONS };

export interface ResolvedItemSource {
  type: string;
  icon: NotebookIconName;
  label: string;
  canOpen: boolean;
}

function resolveFromType(type: SourceType): ResolvedItemSource {
  const display = displayForSourceType(type);
  return {
    type,
    icon: display.icon,
    label: display.label,
    canOpen: true,
  };
}

export function resolveItemSource(item: MindtaskerItem): ResolvedItemSource {
  const material = item.source_materials ?? null;

  if (material) {
    const type = material.source_type as SourceType;
    const display = displayForSourceType(type);
    return {
      type,
      icon: display.icon,
      label: display.label,
      canOpen: true,
    };
  }

  if (item.source_material_id) {
    return resolveFromType("whatsapp_text");
  }

  const fallbackText = [item.content, item.title].find((t) => t.trim().length > 0) ?? "";

  return {
    type: "typed_text",
    icon: MANUAL_SOURCE_DISPLAY.icon,
    label: MANUAL_SOURCE_DISPLAY.label,
    canOpen: fallbackText.length > 0,
  };
}
