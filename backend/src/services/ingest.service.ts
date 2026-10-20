import { parseInputForIngest } from "./parse-input.service.js";
import { enrichParsedItemsWithAnalysis } from "./item-analysis.service.js";
import {
  saveIngestionResult,
  type CreateSourceMaterialInput,
  type SaveIngestionResult,
} from "./items.service.js";
import { syncEmbeddingsForItems } from "./search.service.js";
import { getUserTagNames } from "./user-tags.service.js";
import {
  assertAiParseQuota,
  estimateTextParseUnits,
  incrementAiParseUsage,
} from "./usage.service.js";
import type { ParsedItem } from "../types/ai.js";
import type { SourceType } from "../types/database.js";
import { applySplitMergeLessons, listIngestLessons } from "./ingest-lessons.service.js";
import { filterDuplicateParsedItems } from "../lib/duplicate-detect.js";
import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { featureFlags } from "../lib/feature-flags.js";
import { enrichWhatsAppCapture, type CaptureRow } from "../lib/proactive-whatsapp.js";

export interface IngestTextParams {
  userId: string;
  text: string;
  sourceType: SourceType;
  rawText?: string;
  storageUrl?: string | null;
  metadata?: Record<string, unknown>;
  timezone?: string;
  locale?: string;
}

function emptyIngestionResult(params: IngestTextParams): SaveIngestionResult {
  return {
    sourceMaterial: {
      id: "00000000-0000-4000-8000-000000000000",
      user_id: params.userId,
      source_type: params.sourceType,
      storage_url: params.storageUrl ?? null,
      raw_text: params.rawText ?? params.text,
      metadata: params.metadata ?? {},
      created_at: new Date().toISOString(),
    },
    items: [],
  };
}

async function alreadyCapturedWhatsAppMessage(
  userId: string,
  messageId: string,
): Promise<boolean> {
  if (!env.isSupabaseConfigured || !messageId.trim()) return false;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("mindtasker_items")
    .select("id")
    .eq("user_id", userId)
    .filter("metadata->>whatsapp_message_id", "eq", messageId.trim())
    .limit(1);
  return Boolean(data?.[0]);
}

export async function ingestText(params: IngestTextParams): Promise<SaveIngestionResult> {
  // Persists AI-parsed rows into the user's Inbox (`items` + `source_materials`).
  const whatsappMessageId =
    typeof params.metadata?.whatsapp_message_id === "string"
      ? params.metadata.whatsapp_message_id
      : "";
  if (await alreadyCapturedWhatsAppMessage(params.userId, whatsappMessageId)) {
    return emptyIngestionResult(params);
  }

  const units = estimateTextParseUnits(params.text);
  await assertAiParseQuota(params.userId, units);

  const allowedTags = await getUserTagNames(params.userId);
  const lessons = await listIngestLessons(params.userId);

  const parsed = await parseInputForIngest({
    text: params.text,
    timezone: params.timezone,
    locale: params.locale,
    allowedTags,
    lessons,
  });

  const merged = applySplitMergeLessons(parsed, params.text, lessons);
  const existing = await listRecentInboxKeys(params.userId);
  const uniqueItems = filterDuplicateParsedItems(merged.items, existing);
  if (uniqueItems.length === 0) {
    return emptyIngestionResult(params);
  }

  const referenceDate = new Date();
  const enrichedItems = enrichParsedItemsWithAnalysis(uniqueItems, {
    sourceType: params.sourceType,
    sourceText: params.text,
    timezone: params.timezone,
    referenceDate,
  });
  const itemsForSave = applyWhatsAppCaptureEnrichment(
    params.sourceType,
    params.text,
    enrichedItems,
    allowedTags,
  );

  const result = await saveIngestionResult({
    userId: params.userId,
    source: {
      userId: params.userId,
      sourceType: params.sourceType,
      rawText: params.rawText ?? params.text,
      storageUrl: params.storageUrl,
      metadata: params.metadata,
    },
    items: itemsForSave,
  });

  const itemIds = result.items.map((item) => item.id);
  if (itemIds.length > 0) {
    await syncEmbeddingsForItems(itemIds);
  }

  const eventType = params.sourceType === "notebook_ocr" ? "ocr" : "ai_parse";
  await incrementAiParseUsage(params.userId, eventType, units, {
    text_length: params.text.length,
    estimated_tokens: units,
  });

  return result;
}

function applyWhatsAppCaptureEnrichment(
  sourceType: SourceType,
  text: string,
  items: ParsedItem[],
  allowedTags: string[],
): ParsedItem[] {
  if (!sourceType.startsWith("whatsapp")) return items;
  if (!featureFlags.multiCard && !featureFlags.recurrence && !featureFlags.autoCategory) {
    return items;
  }
  const rows: CaptureRow[] = items.map((item) => ({
    title: item.title,
    content: item.content,
    is_actionable: item.is_actionable,
    tags: item.tags,
    due_date: item.due_date,
    analysis: item.analysis,
    reminder_recurrence: item.reminder_recurrence ?? null,
    checklist: item.checklist,
    priority: item.priority,
  }));
  const enriched = enrichWhatsAppCapture(text, rows, {
    multiCard: featureFlags.multiCard,
    recurrence: featureFlags.recurrence,
    autoCategory: featureFlags.autoCategory,
    allowedTags,
  });
  return enriched.map((row) => {
    const template = items[0];
    return {
      title: row.title,
      content: row.content,
      is_actionable: row.is_actionable,
      tags: row.tags.length > 0 ? row.tags : template?.tags ?? row.tags,
      due_date: row.due_date,
      analysis: (row.analysis as ParsedItem["analysis"]) ?? template?.analysis ?? items[0]!.analysis,
      reminder_recurrence:
        row.reminder_recurrence === "daily" ||
        row.reminder_recurrence === "weekly" ||
        row.reminder_recurrence === "monthly" ||
        row.reminder_recurrence === "weekdays"
          ? row.reminder_recurrence
          : null,
      checklist: row.checklist,
      priority: row.priority,
    };
  });
}

async function listRecentInboxKeys(
  userId: string,
): Promise<Array<{ title: string; content?: string | null }>> {
  if (!env.isSupabaseConfigured) return [];
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("mindtasker_items")
    .select("title, content")
    .eq("user_id", userId)
    .gte("created_at", since)
    .limit(80);
  return data ?? [];
}

export async function ingestParsedItems(params: {
  userId: string;
  source: CreateSourceMaterialInput;
  items: ParsedItem[];
}): Promise<SaveIngestionResult> {
  const result = await saveIngestionResult(params);
  const itemIds = result.items.map((item) => item.id);
  if (itemIds.length > 0) {
    await syncEmbeddingsForItems(itemIds);
  }
  return result;
}
