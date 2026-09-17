import { useEffect, useState } from "react";

import {
  getCloudUserProfile,
  updateCloudUserProfile,
} from "../lib/user-profile";

export function OnboardingBanner({ enabled }: { enabled: boolean }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    let cancelled = false;
    void getCloudUserProfile()
      .then((profile) => {
        if (!cancelled) setVisible(!profile.onboarding_completed_at);
      })
      .catch(() => {
        if (!cancelled) setVisible(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!visible) return null;

  async function dismiss() {
    setBusy(true);
    try {
      await updateCloudUserProfile({
        onboarding_completed_at: new Date().toISOString(),
      });
      setVisible(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-indigo-200 bg-indigo-50 px-4 py-3" dir="rtl">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-sm text-indigo-950">
          <p className="font-semibold">ברוכים הבאים ל-BabiTk</p>
          <ol className="mt-1 list-decimal space-y-0.5 pr-5 text-xs leading-5 text-indigo-900">
            <li>חברו קבוצת וואטסאפ בהגדרות — ההודעות נקלטו אוטומטית.</li>
            <li>
              בקבוצה כתבו <strong>תפריט</strong> לשאלות מובנות: משימות היום, מחר, עבודה, ותכנון היום.
            </li>
            <li>אפשרו התראות בפעמון כדי לקבל תזכורות במערכת ובוואטסאפ.</li>
          </ol>
        </div>
        <button
          type="button"
          className="shrink-0 self-start rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60"
          onClick={() => void dismiss()}
          disabled={busy}
        >
          הבנתי
        </button>
      </div>
    </div>
  );
}
