import type { SourceType } from "../../validators";

export type UrgencyLevel = "גבוהה" | "בינונית" | "נמוכה" | "חסר";

export const URGENCY_LEVELS = ["גבוהה", "בינונית", "נמוכה", "חסר"] as const;

export interface ParsedItemAnalysis {
  goal: string;
  data_points: string;
  task: string;
  urgency: UrgencyLevel;
  time_mention: string;
}

export interface StoredItemAnalysis extends ParsedItemAnalysis {
  source: string;
  target_at: string | null;
  notify_at: string | null;
  formatted: string;
}

export interface ParsedItem {
  title: string;
  content: string;
  is_actionable: boolean;
  due_date: string | null;
  tags: string[];
  analysis: ParsedItemAnalysis | StoredItemAnalysis;
}

export interface ParseInputResponse {
  items: ParsedItem[];
}

export interface ParseInputOptions {
  text: string;
  timezone?: string;
  locale?: string;
  referenceDate?: Date;
  allowedTags?: string[];
  lessons?: import("./ingestLearning").IngestLesson[];
}

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  whatsapp_text: "וואטסאפ",
  typed_text: "הקלדה",
  whatsapp_voice: "קול",
  notebook_ocr: "תמונה",
  image: "תמונה",
  document: "מסמך",
};

export function isValidParseResponse(value: unknown): value is ParseInputResponse {
  if (!value || typeof value !== "object") return false;
  const items = (value as ParseInputResponse).items;
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every(
    (item) =>
      typeof item.title === "string" &&
      typeof item.content === "string" &&
      typeof item.is_actionable === "boolean" &&
      Array.isArray(item.tags) &&
      item.analysis &&
      typeof item.analysis === "object",
  );
}
