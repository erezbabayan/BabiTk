import { enrichParsedItemsWithAnalysis } from "./itemAnalysis.ts";
import { parseInputLocally } from "./localParse.ts";
import type { ParsedItem, SourceType } from "./types.ts";

export type IngestSourceType = SourceType;

export interface InboundParsedFields {
  title: string;
  content: string;
  is_actionable: boolean;
  tags: string[];
  due_date: string | null;
  analysis: ParsedItem["analysis"];
  reminder_recurrence?: ParsedItem["reminder_recurrence"];
  checklist?: ParsedItem["checklist"];
}

export interface SupabaseIngestRow {
  user_id: string;
  title: string;
  content: string;
  is_actionable: boolean;
  status: "inbox";
  tags: string[];
  due_date: string | null;
  metadata: Record<string, unknown>;
  sort_order: number;
  last_interacted_at: string;
  source_material_id?: string | null;
}

export interface ParseInboundOptions {
  sourceType?: IngestSourceType;
  timezone?: string;
  referenceDate?: Date;
  fallbackTitle?: string;
}

export interface BuildSupabaseIngestRowsOptions extends ParseInboundOptions {
  nowMs?: number;
  extraMetadata?: Record<string, unknown>;
  sourceMaterialId?: string | null;
}

function fallbackTitleFromText(text: string, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim().slice(0, 120);
  return text.split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 120) || "פריט חדש";
}

export function layoutMetadataFromParsed(item: {
  checklist?: Array<{ id: string; text: string; done: boolean }>;
  reminder_recurrence?: string | null;
}): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  if (
    item.reminder_recurrence === "daily" ||
    item.reminder_recurrence === "weekly" ||
    item.reminder_recurrence === "monthly" ||
    item.reminder_recurrence === "weekdays"
  ) {
    extra.reminder_recurrence = item.reminder_recurrence;
    extra.reminder_manual = true;
  }
  if (item.checklist && item.checklist.length > 0) {
    extra.checklist = item.checklist;
  }
  return extra;
}

/**
 * Hebrew local parse + notify_at enrichment for any inbound channel.
 * Used by web/mobile (no Express /api) and WhatsApp Edge ingest.
 */
export function parseInboundText(
  text: string,
  options?: ParseInboundOptions,
): InboundParsedFields[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const timezone = options?.timezone ?? "Asia/Jerusalem";
  const sourceType = options?.sourceType ?? "typed_text";
  const parsed = parseInputLocally({
    text: trimmed,
    timezone,
    referenceDate: options?.referenceDate,
  });
  const enriched = enrichParsedItemsWithAnalysis(parsed.items, {
    sourceType,
    sourceText: trimmed,
    timezone,
    referenceDate: options?.referenceDate,
  });

  return enriched.map((item) => {
    const title =
      item.title.trim() || fallbackTitleFromText(trimmed, options?.fallbackTitle);
    return {
      title: title.slice(0, 120),
      content: item.content.trim(),
      is_actionable: item.is_actionable,
      tags: item.tags ?? [],
      due_date: item.due_date,
      analysis: item.analysis,
      reminder_recurrence: item.reminder_recurrence ?? null,
      checklist: item.checklist?.length ? item.checklist : undefined,
    };
  });
}

export function buildSupabaseIngestRows(
  userId: string,
  text: string,
  options?: BuildSupabaseIngestRowsOptions,
): SupabaseIngestRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sourceType = options?.sourceType ?? "typed_text";
  const nowMs = options?.nowMs ?? Date.now();
  const parsed = parseInboundText(trimmed, {
    sourceType,
    timezone: options?.timezone,
    referenceDate: options?.referenceDate,
    fallbackTitle: options?.fallbackTitle,
  });

  return parsed.map((item, index) => {
    const row: SupabaseIngestRow = {
      user_id: userId,
      title: item.title,
      content: item.content,
      is_actionable: item.is_actionable,
      status: "inbox",
      tags: item.tags,
      due_date: item.due_date,
      metadata: {
        source: sourceType,
        analysis: item.analysis,
        ...layoutMetadataFromParsed(item),
        ...(options?.extraMetadata ?? {}),
      },
      sort_order: nowMs + index,
      last_interacted_at: new Date(nowMs).toISOString(),
    };
    if (options?.sourceMaterialId) {
      row.source_material_id = options.sourceMaterialId;
    }
    return row;
  });
}
