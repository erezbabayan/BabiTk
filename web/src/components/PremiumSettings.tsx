import { useState } from "react";

import { setSubscriptionTierApi, type UsageSummary } from "../lib/api";

interface PremiumSettingsProps {
  summary: UsageSummary | null;
  onChanged?: () => void;
}

export function PremiumSettings({ summary, onChanged }: PremiumSettingsProps) {
  const [busy, setBusy] = useState<"free" | "premium" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!summary) {
    return <p className="text-sm text-slate-500">טוען...</p>;
  }

  const current = summary.isPremium ? "premium" : "free";

  async function selectTier(tier: "free" | "premium") {
    if (tier === current || busy) return;
    setBusy(tier);
    setError(null);
    try {
      await setSubscriptionTierApi(tier);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לעדכן את המנוי");
    } finally {
      setBusy(null);
    }
  }

  const audioUsedMin = Math.ceil(summary.audio.used / 60);
  const audioAllocMin = Math.ceil(summary.audio.allocated / 60);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">בחרו את סוג החשבון. ניהול משתמשים אחרים יתווסף למנהל המערכת בהמשך.</p>

      <button
        type="button"
        onClick={() => void selectTier("free")}
        disabled={busy !== null}
        className={`w-full rounded-xl border p-4 text-right ${
          current === "free"
            ? "border-slate-800 bg-slate-50"
            : "border-slate-200 hover:bg-slate-50"
        } disabled:opacity-60`}
      >
        <p className="font-medium text-slate-900">חשבון רגיל</p>
        <p className="mt-1 text-sm text-slate-600">מכסות חודשיות ל-AI, תמלול ו-OCR.</p>
        {current === "free" ? (
          <p className="mt-2 text-sm text-slate-700">
            תמלול: {audioUsedMin}/{audioAllocMin} דק׳ · AI: {summary.aiParses.used}/
            {summary.aiParses.allocated}
          </p>
        ) : null}
        {current === "free" ? (
          <p className="mt-2 text-xs font-medium text-slate-800">מנוי נוכחי</p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            {busy === "free" ? "מעדכן..." : "מעבר לחשבון רגיל"}
          </p>
        )}
      </button>

      <button
        type="button"
        onClick={() => void selectTier("premium")}
        disabled={busy !== null}
        className={`w-full rounded-xl border p-4 text-right ${
          current === "premium"
            ? "border-emerald-700 bg-emerald-50"
            : "border-slate-200 hover:bg-slate-50"
        } disabled:opacity-60`}
      >
        <p className="font-medium text-emerald-900">Premium</p>
        <p className="mt-1 text-sm text-emerald-800">גישה בלתי מוגבלת ל-AI, תמלול ו-OCR.</p>
        {current === "premium" ? (
          <p className="mt-2 text-xs font-medium text-emerald-800">מנוי נוכחי</p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            {busy === "premium" ? "מעדכן..." : "שדרוג ל-Premium"}
          </p>
        )}
      </button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
