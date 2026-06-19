import type { StoredItemAnalysis, UrgencyLevel } from "../lib/item-analysis";
import { formatAnalysisTime, showTimeMention, urgencyBadgeClass } from "../lib/item-analysis";

interface ItemAnalysisPanelProps {
  analysis: StoredItemAnalysis;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2 text-sm">
      <span className="font-medium text-slate-500">{label}</span>
      <span className="text-slate-800">{value}</span>
    </div>
  );
}

export function ItemAnalysisPanel({ analysis }: ItemAnalysisPanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">ניתוח קליטה</h3>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${urgencyBadgeClass(analysis.urgency as UrgencyLevel)}`}
        >
          {analysis.urgency}
        </span>
      </div>
      <div className="space-y-1.5">
        <Row label="מטרה" value={analysis.goal} />
        <Row label="מקור" value={analysis.source} />
        <Row label="משימה" value={analysis.task} />
        {showTimeMention(analysis) ? (
          <Row label="איזכור זמן" value={analysis.time_mention} />
        ) : null}
        {analysis.target_at ? (
          <Row label="מועד יעד" value={formatAnalysisTime(analysis.target_at) ?? analysis.target_at} />
        ) : null}
        {analysis.notify_at ? (
          <Row label="התראה" value={formatAnalysisTime(analysis.notify_at) ?? analysis.notify_at} />
        ) : null}
      </div>
    </section>
  );
}
