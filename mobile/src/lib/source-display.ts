import type { NotebookIconName } from "../components/NotebookIcons";

/** User-facing source categories (icons + Hebrew labels). */
export type SourceDisplayKind = "whatsapp" | "typed" | "voice" | "image" | "document";

export const SOURCE_DISPLAY: Record<
  SourceDisplayKind,
  { icon: NotebookIconName; label: string }
> = {
  whatsapp: { icon: "whatsapp", label: "וואטסאפ" },
  typed: { icon: "keyboard", label: "הקלדה" },
  voice: { icon: "mic", label: "קול" },
  image: { icon: "image", label: "תמונה" },
  document: { icon: "document", label: "מסמך" },
};

export type SourceType =
  | "whatsapp_text"
  | "whatsapp_voice"
  | "notebook_ocr"
  | "typed_text"
  | "image"
  | "document";

const SOURCE_TYPE_TO_KIND: Record<SourceType, SourceDisplayKind> = {
  whatsapp_text: "whatsapp",
  typed_text: "typed",
  whatsapp_voice: "voice",
  notebook_ocr: "image",
  image: "image",
  document: "document",
};

export function sourceTypeToDisplayKind(type: string | null | undefined): SourceDisplayKind {
  if (type && type in SOURCE_TYPE_TO_KIND) {
    return SOURCE_TYPE_TO_KIND[type as SourceType];
  }
  return "whatsapp";
}

export function displayForSourceType(type: string | null | undefined): {
  icon: NotebookIconName;
  label: string;
  kind: SourceDisplayKind;
} {
  const kind = sourceTypeToDisplayKind(type);
  return { ...SOURCE_DISPLAY[kind], kind };
}

export const SOURCE_ICONS: Record<SourceType, NotebookIconName> = {
  whatsapp_text: SOURCE_DISPLAY.whatsapp.icon,
  typed_text: SOURCE_DISPLAY.typed.icon,
  whatsapp_voice: SOURCE_DISPLAY.voice.icon,
  notebook_ocr: SOURCE_DISPLAY.image.icon,
  image: SOURCE_DISPLAY.image.icon,
  document: SOURCE_DISPLAY.document.icon,
};

export const SOURCE_LABELS: Record<SourceType, string> = {
  whatsapp_text: SOURCE_DISPLAY.whatsapp.label,
  typed_text: SOURCE_DISPLAY.typed.label,
  whatsapp_voice: SOURCE_DISPLAY.voice.label,
  notebook_ocr: SOURCE_DISPLAY.image.label,
  image: SOURCE_DISPLAY.image.label,
  document: SOURCE_DISPLAY.document.label,
};

export const MANUAL_SOURCE_DISPLAY = SOURCE_DISPLAY.typed;
