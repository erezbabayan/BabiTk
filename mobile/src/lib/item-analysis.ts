export type UrgencyLevel = "גבוהה" | "בינונית" | "נמוכה" | "חסר";

export interface StoredItemAnalysis {
  goal: string;
  source: string;
  data_points: string;
  task: string;
  urgency: UrgencyLevel;
  time_mention: string;
  target_at: string | null;
  notify_at: string | null;
  formatted: string;
}

export function getItemAnalysis(
  metadata: Record<string, unknown> | null | undefined,
): StoredItemAnalysis | null {
  if (!metadata || typeof metadata !== "object") return null;
  const analysis = metadata.analysis;
  if (!analysis || typeof analysis !== "object") return null;
  const record = analysis as Record<string, unknown>;
  if (
    typeof record.goal !== "string" ||
    typeof record.source !== "string" ||
    typeof record.data_points !== "string" ||
    typeof record.task !== "string" ||
    typeof record.urgency !== "string" ||
    typeof record.time_mention !== "string"
  ) {
    return null;
  }
  return {
    goal: record.goal,
    source: record.source,
    data_points: record.data_points,
    task: record.task,
    urgency: record.urgency as UrgencyLevel,
    time_mention: record.time_mention,
    target_at: typeof record.target_at === "string" ? record.target_at : null,
    notify_at: typeof record.notify_at === "string" ? record.notify_at : null,
    formatted: typeof record.formatted === "string" ? record.formatted : "",
  };
}

export function formatAnalysisTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("he-IL", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Hide relative time phrases when a concrete target date is already known. */
export function showTimeMention(analysis: StoredItemAnalysis): boolean {
  if (analysis.target_at) return false;
  return analysis.time_mention !== "חסר";
}

const URGENCY_COLORS: Record<UrgencyLevel, string> = {
  גבוהה: "#b91c1c",
  בינונית: "#b45309",
  נמוכה: "#64748b",
  חסר: "#94a3b8",
};

export function urgencyColor(level: UrgencyLevel): string {
  return URGENCY_COLORS[level];
}
