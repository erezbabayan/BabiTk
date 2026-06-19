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

export async function ingestText(params: IngestTextParams): Promise<SaveIngestionResult> {
  // Persists AI-parsed rows into the user's Inbox (`items` + `source_materials`).
  const units = estimateTextParseUnits(params.text);
  await assertAiParseQuota(params.userId, units);

  const allowedTags = await getUserTagNames(params.userId);

  const parsed = await parseInputForIngest({
    text: params.text,
    timezone: params.timezone,
    locale: params.locale,
    allowedTags,
  });

  const referenceDate = new Date();
  const enrichedItems = enrichParsedItemsWithAnalysis(parsed.items, {
    sourceType: params.sourceType,
    sourceText: params.text,
    timezone: params.timezone,
    referenceDate,
  });

  const result = await saveIngestionResult({
    userId: params.userId,
    source: {
      userId: params.userId,
      sourceType: params.sourceType,
      rawText: params.rawText ?? params.text,
      storageUrl: params.storageUrl,
      metadata: params.metadata,
    },
    items: enrichedItems,
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
