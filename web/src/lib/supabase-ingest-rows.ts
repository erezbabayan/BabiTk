import { parseInputLocally } from "../../../convex/lib/ingest/localParse";
import { enrichParsedItemsWithAnalysis } from "../../../convex/lib/ingest/itemAnalysis";

export interface SupabaseIngestRow {
  user_id: string;
  title: string;
  content: string;
  is_actionable: boolean;
  status: "inbox";
  tags: string[];
  due_date: string | null;
  metadata: {
    source: "typed_text";
    analysis: unknown;
  };
  sort_order: number;
  last_interacted_at: string;
}

/**
 * Local Hebrew parse so GitHub Pages ingest still sets due_date / notify_at
 * without calling the Express /api/ingest route (which returns 405 on Pages).
 */
export function buildSupabaseIngestRows(
  userId: string,
  text: string,
  options?: { timezone?: string; nowMs?: number; referenceDate?: Date },
): SupabaseIngestRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const timezone = options?.timezone ?? "Asia/Jerusalem";
  const nowMs = options?.nowMs ?? Date.now();
  const parsed = parseInputLocally({
    text: trimmed,
    timezone,
    referenceDate: options?.referenceDate,
  });
  const enriched = enrichParsedItemsWithAnalysis(parsed.items, {
    sourceType: "typed_text",
    sourceText: trimmed,
    timezone,
    referenceDate: options?.referenceDate,
  });

  return enriched.map((item, index) => {
    const firstLine =
      item.title.trim() ||
      trimmed.split(/\r?\n/).find((line) => line.trim())?.trim() ||
      "פריט חדש";
    return {
      user_id: userId,
      title: firstLine.slice(0, 120),
      content: item.content.trim() || trimmed,
      is_actionable: item.is_actionable,
      status: "inbox",
      tags: item.tags ?? [],
      due_date: item.due_date,
      metadata: {
        source: "typed_text",
        analysis: item.analysis,
      },
      sort_order: nowMs + index,
      last_interacted_at: new Date(nowMs).toISOString(),
    };
  });
}
