export type SourceType =
  | "whatsapp_voice"
  | "whatsapp_text"
  | "notebook_ocr"
  | "typed_text"
  | "image"
  | "document";

export type ItemStatus = "inbox" | "pending" | "completed" | "snoozed_archive";

export interface DbUser {
  id: string;
  email: string;
  phone: string | null;
  phone_verified: boolean;
  tier: "free" | "premium";
  allocated_audio_seconds: number;
  used_audio_seconds: number;
}

export interface DbSourceMaterial {
  id: string;
  user_id: string;
  source_type: SourceType;
  storage_url: string | null;
  raw_text: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DbMindtaskerItem {
  id: string;
  user_id: string;
  source_material_id: string | null;
  title: string;
  content: string;
  is_actionable: boolean;
  status: ItemStatus;
  due_date: string | null;
  completed_at: string | null;
  calendar_event_id: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  last_interacted_at: string;
  created_at: string;
  updated_at: string;
}
