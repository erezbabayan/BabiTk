import { z } from "zod";
import type { SourceType } from "./database.js";

export const URGENCY_LEVELS = ["גבוהה", "בינונית", "נמוכה", "חסר"] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

export const urgencyLevelSchema = z.enum(URGENCY_LEVELS);

export const parsedItemAnalysisSchema = z.object({
  goal: z.string().min(1),
  data_points: z.string().min(1),
  task: z.string().min(1),
  urgency: urgencyLevelSchema,
  /** איזכור זמן מהקלט המקורי — "חסר" אם לא צוין */
  time_mention: z.string().min(1),
});

export type ParsedItemAnalysis = z.infer<typeof parsedItemAnalysisSchema>;

export interface StoredItemAnalysis extends ParsedItemAnalysis {
  /** מקור_מידע — injected by server from source_type, not AI */
  source: string;
  /** מועד יעד מחושב (ISO) — מ-due_date */
  target_at: string | null;
  /** מועד התראה מחושב (ISO) */
  notify_at: string | null;
  /** תשובה_פורמט — fixed Hebrew template for display/export */
  formatted: string;
}

export interface ItemAnalysisMetadata {
  analysis: StoredItemAnalysis;
}

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  whatsapp_text: "וואטסאפ",
  typed_text: "הקלדה",
  whatsapp_voice: "קול",
  notebook_ocr: "תמונה",
  image: "תמונה",
  document: "מסמך",
};
