import type { UsageSummary } from "../lib/api";

interface PremiumSettingsProps {
  summary: UsageSummary | null;
  onOpenPaywall: () => void;
}

export function PremiumSettings({ summary, onOpenPaywall }: PremiumSettingsProps) {
  if (!summary) {
    return <p className="text-sm text-slate-500">טוען...</p>;
  }

  if (summary.isPremium) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-medium text-emerald-900">Premium פעיל</p>
          <p className="mt-1 text-emerald-800">יש לך גישה בלתי מוגבלת ל-AI, תמלול ו-OCR.</p>
        </div>
        <button
          type="button"
          onClick={onOpenPaywall}
          className="w-full border border-slate-300 hover:bg-slate-50"
        >
          ניהול מנוי
        </button>
      </div>
    );
  }

  const aiPct = Math.min(
    100,
    Math.round((summary.aiParses.used / summary.aiParses.allocated) * 100),
  );
  const audioPct = Math.min(
    100,
    Math.round((summary.audio.used / summary.audio.allocated) * 100),
  );
  const audioUsedMin = Math.ceil(summary.audio.used / 60);
  const audioAllocMin = Math.ceil(summary.audio.allocated / 60);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="font-medium text-slate-900">חשבון חינמי</p>
        <p className="mt-2 text-slate-700">
          מכסת תמלול: {audioUsedMin}/{audioAllocMin} דק׳ ({audioPct}%)
        </p>
        <p className="mt-1 text-slate-700">
          מכסת AI: {summary.aiParses.used}/{summary.aiParses.allocated} ({aiPct}%)
        </p>
      </div>
      <button
        type="button"
        onClick={onOpenPaywall}
        className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
      >
        שדרג ל-Premium
      </button>
    </div>
  );
}
