import type { StoredItemAnalysis, UrgencyLevel } from "../lib/item-analysis";
import { formatAnalysisTime, showTimeMention, urgencyBadgeClass } from "../lib/item-analysis";

interface ItemAnalysisPanelProps {
  analysis: StoredItemAnalysis;
  compact?: boolean;
}

function Row({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`grid grid-cols-[4rem_1fr] gap-1 ${compact ? "text-[10px] leading-tight" : "gap-2 text-sm"}`}>
      <span className={`font-medium text-slate-500 ${compact ? "" : ""}`}>{label}</span>
      <span className="text-slate-800">{value}</span>
    </div>
  );
}

export function ItemAnalysisPanel({ analysis, compact = false }: ItemAnalysisPanelProps) {
  return (
    <section className={compact ? "p-1.5" : "rounded-lg border border-slate-200 bg-slate-50/80 p-3"}>
      {!compact ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">ניתוח קליטה</h3>
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${urgencyBadgeClass(analysis.urgency as UrgencyLevel)}`}
          >
            {analysis.urgency}
          </span>
        </div>
      ) : (
        <div className="mb-1 flex items-center justify-end">
          <span
            className={`rounded-full border px-1.5 py-px text-[9px] font-medium ${urgencyBadgeClass(analysis.urgency as UrgencyLevel)}`}
          >
            {analysis.urgency}
          </span>
        </div>
      )}
      <div className={compact ? "space-y-0.5" : "space-y-1.5"}>
        <Row label="מטרה" value={analysis.goal} compact={compact} />
        <Row label="מקור" value={analysis.source} compact={compact} />
        <Row label="משימה" value={analysis.task} compact={compact} />
        {showTimeMention(analysis) ? (
          <Row label="זמן" value={analysis.time_mention} compact={compact} />
        ) : null}
        {analysis.target_at ? (
          <Row
            label="יעד"
            value={formatAnalysisTime(analysis.target_at) ?? analysis.target_at}
            compact={compact}
          />
        ) : null}
        {analysis.notify_at ? (
          <Row
            label="התראה"
            value={formatAnalysisTime(analysis.notify_at) ?? analysis.notify_at}
            compact={compact}
          />
        ) : null}
      </div>
    </section>
  );
}
