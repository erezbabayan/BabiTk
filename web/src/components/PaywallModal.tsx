import { useState } from "react";
import { createBillingPortalApi, createCheckoutSessionApi } from "../lib/api";
import type { UsageSummary } from "../lib/api";

interface PaywallModalProps {
  open: boolean;
  code: "audio_quota" | "ai_parse_quota" | null;
  summary: UsageSummary | null;
  onClose: () => void;
  onUpgraded?: () => void;
}

export function PaywallModal({ open, code, summary, onClose, onUpgraded }: PaywallModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const isAudio = code === "audio_quota";
  const title = code
    ? isAudio
      ? "מכסת תמלול אזלה"
      : "מכסת AI אזלה"
    : "MindTasker Premium";
  const description = code
    ? isAudio
      ? "הגעת למכסת דקות התמלול החודשית בחשבון החינמי."
      : "הגעת למכסת ניתוחי ה-AI החודשית בחשבון החינמי."
    : "מכסות בלתי מוגבלות ל-AI, תמלול ו-OCR — בלי הגבלות חודשיות.";

  async function handleUpgrade() {
    setLoading(true);
    setError(null);
    try {
      const url = await createCheckoutSessionApi("web");
      onUpgraded?.();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בפתיחת תשלום");
      setLoading(false);
    }
  }

  async function handleManage() {
    setLoading(true);
    setError(null);
    try {
      const url = await createBillingPortalApi();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בניהול מנוי");
      setLoading(false);
    }
  }

  const isPremium = summary?.isPremium;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl"
      >
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">{description}</p>

        {summary && !summary.isPremium ? (
          <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex justify-between">
              <span>ניתוחי AI</span>
              <span>
                {summary.aiParses.used} / {summary.aiParses.allocated}
              </span>
            </div>
            <div className="flex justify-between">
              <span>תמלול (שניות)</span>
              <span>
                {summary.audio.used} / {summary.audio.allocated}
              </span>
            </div>
          </div>
        ) : null}

        {isPremium ? (
          <p className="mt-4 text-sm text-emerald-700">יש לך מנוי Premium פעיל.</p>
        ) : (
          <ul className="mt-4 list-inside list-disc text-sm text-slate-600">
            <li>ניתוחי AI ללא הגבלה</li>
            <li>תמלול קולי ללא הגבלה</li>
            <li>OCR מחברות ללא הגבלה</li>
          </ul>
        )}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="border border-slate-300 hover:bg-slate-50"
          >
            סגור
          </button>
          {isPremium ? (
            <button
              type="button"
              onClick={() => void handleManage()}
              disabled={loading}
              className="bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50"
            >
              {loading ? "..." : "ניהול מנוי"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleUpgrade()}
              disabled={loading}
              className="bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "..." : "שדרג ל-Premium"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
