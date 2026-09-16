import { useEffect, useState } from "react";
import { getGoogleCalendarConnectUrl, getGoogleCalendarStatus } from "../lib/api";
import { isSupabaseConfigured } from "../lib/supabase";

export function GoogleCalendarLink() {
  const [linked, setLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getGoogleCalendarStatus()
      .then(setLinked)
      .catch(() => setLinked(false))
      .finally(() => setLoading(false));
  }, []);

  async function handleConnect() {
    setError(null);
    try {
      const url = await getGoogleCalendarConnectUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "חיבור היומן נכשל");
    }
  }

  if (loading) return null;

  if (isSupabaseConfigured) {
    return (
      <div className="space-y-2 text-sm" dir="rtl">
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
          {linked
            ? "📅 סנכרון יומן מסומן בחשבון."
            : "סטטוס Google Calendar נשמר בחשבון. חיבור OAuth מלא דורש שרת API נפרד."}
        </p>
        {error ? <p className="text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleConnect()}
      disabled={linked}
      className="border border-slate-300 hover:bg-slate-50 disabled:opacity-60"
    >
      {linked ? "📅 יומן מחובר" : "📅 חבר Google Calendar"}
    </button>
  );
}
