import { parseInputLocally } from "../../../convex/lib/ingest/localParse";
import { correctEnglishKeyboardHebrew } from "../../../convex/lib/ingest/englishKeyboardHebrew";
import type { MindtaskerItem } from "./supabase";

function clientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jerusalem";
  } catch {
    return "Asia/Jerusalem";
  }
}

/** Rule-based capture parse (same pipeline as backend / Convex ingest). */
export function parseCaptureText(text: string): MindtaskerItem[] {
  const trimmed = correctEnglishKeyboardHebrew(text.trim());
  const parsed = parseInputLocally({
    text: trimmed,
    timezone: clientTimezone(),
    referenceDate: new Date(),
    locale: "he-IL",
  });

  const stamp = Date.now();
  return parsed.items.map((item, index) => {
    const analysis =
      item.analysis && typeof item.analysis === "object"
        ? { analysis: item.analysis }
        : {};

    return {
      id: `cap-${stamp}-${index}`,
      title: item.title,
      content: item.content,
      is_actionable: item.is_actionable,
      status: "inbox",
      due_date: item.is_actionable ? item.due_date : null,
      tags: item.tags,
      metadata: analysis,
      last_interacted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as MindtaskerItem;
  });
}
