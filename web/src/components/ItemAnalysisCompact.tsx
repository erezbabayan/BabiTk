import type { StoredItemAnalysis, UrgencyLevel } from "../lib/item-analysis";
import { formatAnalysisTime, showTimeMention, urgencyBadgeClass } from "../lib/item-analysis";

interface ItemAnalysisCompactProps {
  analysis: StoredItemAnalysis;
}

export function ItemAnalysisCompact({ analysis }: ItemAnalysisCompactProps) {
  const notifyLabel = formatAnalysisTime(analysis.notify_at);

  return (
    <div className="mt-0.5 rounded border border-slate-200/80 bg-white/60 px-1 py-0.5">
      <div className="flex flex-wrap items-center justify-end gap-1">
        <span
          className={`rounded-full border px-1 py-px text-[8px] font-medium leading-none ${urgencyBadgeClass(analysis.urgency as UrgencyLevel)}`}
        >
          {analysis.urgency}
        </span>
        {notifyLabel ? (
          <span className="text-[8px] leading-none text-violet-700">🔔 {notifyLabel}</span>
        ) : null}
        {showTimeMention(analysis) ? (
          <span className="max-w-[55%] truncate text-[8px] leading-none text-slate-500">
            ⏱ {analysis.time_mention}
          </span>
        ) : null}
      </div>
    </div>
  );
}
