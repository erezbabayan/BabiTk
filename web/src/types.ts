export type ItemStatus = "inbox" | "pending" | "completed" | "snoozed_archive";
export type SourceType = "whatsapp_voice" | "whatsapp_text" | "notebook_ocr";

export interface OcrBBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface OcrLine {
  text: string;
  completed: boolean;
  bbox: OcrBBox;
}

export interface SourceMaterial {
  id: string;
  source_type: SourceType;
  storage_url: string | null;
  raw_text: string | null;
  metadata?: {
    ocr_lines?: OcrLine[];
  } | null;
}

export interface MindtaskerItem {
  id: string;
  user_id: string;
  source_material_id: string | null;
  source_materials?: SourceMaterial | null;
  title: string;
  content: string;
  is_actionable: boolean;
  status: ItemStatus;
  due_date: string | null;
  completed_at: string | null;
  tags: string[];
  metadata?: Record<string, unknown> | null;
  sort_order: number;
  last_interacted_at: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export const SOURCE_ICONS: Record<SourceType, string> = {
  whatsapp_voice: "🎙️",
  whatsapp_text: "💬",
  notebook_ocr: "📷",
};
