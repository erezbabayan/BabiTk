export type ItemStatus = "inbox" | "pending" | "completed" | "snoozed_archive";
export type { SourceType } from "./lib/source-display";
export { SOURCE_ICONS } from "./lib/source-display";

import type { SourceType } from "./lib/source-display";

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
  calendar_event_id?: string | null;
  tags: string[];
  metadata?: Record<string, unknown> | null;
  sort_order: number;
  last_interacted_at: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

