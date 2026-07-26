import { randomUUID } from "node:crypto";
import { DEFAULT_USER_TAGS } from "../constants/default-tags.js";
import { enforceIngestionRules, resolveIngestItemStatus } from "./entity-rules.service.js";
import { enrichParsedItemsWithAnalysis } from "./item-analysis.service.js";
import { parseInputForIngest } from "./parse-input.service.js";
import { transcribeAudio } from "./openai.service.js";
import {
  addSyncItem,
  SYNC_USER_ID,
  type SyncItem,
} from "./sync-store.service.js";
import type { SourceType } from "../types/database.js";
import { extractAnalysisMetadata } from "./item-analysis.service.js";
import type { ParsedItem } from "../types/ai.js";

export interface SyncIngestTextParams {
  text: string;
  sourceType: SourceType;
  timezone?: string;
  locale?: string;
  metadata?: Record<string, unknown>;
}

export async function ingestTextToSyncStore(
  params: SyncIngestTextParams,
): Promise<{ items: SyncItem[] }> {
  const timezone = params.timezone ?? "Asia/Jerusalem";
  const locale = params.locale ?? "he-IL";
  const referenceDate = new Date();

  const allowedTags = DEFAULT_USER_TAGS.map((tag) => tag.name);

  const parsed = await parseInputForIngest({
    text: params.text,
    timezone,
    locale,
    referenceDate,
    allowedTags,
  });

  const ruled = enforceIngestionRules(parsed, {
    timezone,
    referenceDate,
    sourceText: params.text,
    allowedTags,
  });

  const enriched = enrichParsedItemsWithAnalysis(ruled.items, {
    sourceType: params.sourceType,
    sourceText: params.text,
    timezone,
    referenceDate,
  });

  const sourceId = randomUUID();
  const now = new Date().toISOString();
  const sourceMaterials: NonNullable<SyncItem["source_materials"]> = {
    id: sourceId,
    source_type: params.sourceType,
    storage_url: null,
    raw_text: params.text,
    metadata: params.metadata ?? {},
  };

  const created: SyncItem[] = [];

  for (const item of enriched) {
    const syncItem = parsedItemToSyncItem(item, {
      sourceId,
      sourceMaterials,
      now,
    });
    await addSyncItem(syncItem);
    created.push(syncItem);
  }

  return { items: created };
}

export async function ingestVoiceToSyncStore(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<{ text: string; durationSeconds: number; items: SyncItem[] }> {
  const { text, durationSeconds } = await transcribeAudio(buffer, fileName, mimeType);
  const result = await ingestTextToSyncStore({
    text,
    sourceType: "whatsapp_voice",
    metadata: {
      duration_seconds: durationSeconds,
      audio_mime_type: mimeType,
      channel: "mobile",
    },
  });

  return { text, durationSeconds, items: result.items };
}

function parsedItemToSyncItem(
  item: ParsedItem,
  ctx: {
    sourceId: string;
    sourceMaterials: NonNullable<SyncItem["source_materials"]>;
    now: string;
  },
): SyncItem {
  return {
    id: randomUUID(),
    user_id: SYNC_USER_ID,
    source_material_id: ctx.sourceId,
    source_materials: ctx.sourceMaterials,
    title: item.title,
    content: item.content,
    is_actionable: item.is_actionable,
    status: resolveIngestItemStatus(item),
    due_date: item.is_actionable ? item.due_date : null,
    completed_at: null,
    tags: item.tags,
    metadata: extractAnalysisMetadata(item) ?? {},
    sort_order: Date.now(),
    last_interacted_at: ctx.now,
    created_at: ctx.now,
    updated_at: ctx.now,
    deleted_at: null,
  };
}
