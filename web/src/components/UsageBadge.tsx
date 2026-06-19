import type { UsageSummary } from "../lib/api";

interface UsageBadgeProps {
  summary: UsageSummary | null;
  onClick?: () => void;
}

export function UsageBadge({ summary, onClick }: UsageBadgeProps) {
  if (!summary) return null;

  if (summary.isPremium) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300"
      >
        Premium
      </button>
    );
  }

  const aiPct = Math.min(
    100,
    Math.round((summary.aiParses.used / summary.aiParses.allocated) * 100),
  );
  const warn = aiPct >= 80;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${
        warn
          ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
      }`}
      title="מכסת AI חודשית"
    >
      AI {summary.aiParses.used}/{summary.aiParses.allocated}
    </button>
  );
}
