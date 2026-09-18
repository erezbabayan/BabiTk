import { useEffect, useState } from "react";
import {
  disconnectGoogleCalendarApi,
  getGoogleCalendarConnectUrl,
  getGoogleCalendarStatus,
} from "../lib/api";
import { isDemoMode } from "../lib/supabase";

export function GoogleCalendarLink() {
  const [linked, setLinked] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshStatus() {
    try {
      const status = await getGoogleCalendarStatus();
      setLinked(status.linked);
      setConfigured(status.configured);
      if (status.linked) setError(null);
    } catch {
      setLinked(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; ok?: boolean } | null;
      if (data?.type !== "babitk-calendar") return;
      void refreshStatus();
    }
    function onFocus() {
      void refreshStatus();
    }
    window.addEventListener("message", onMessage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  async function handleConnect() {
    setError(null);
    setBusy(true);
    try {
      const url = await getGoogleCalendarConnectUrl();
      if (url.startsWith("#")) {
        setLinked(true);
        return;
      }
      const popup = window.open(url, "babitk-google-calendar", "noopener,noreferrer,width=520,height=720");
      if (!popup) {
        window.location.assign(url);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "חיבור היומן נכשל";
      setError(
        message === "google_not_configured"
          ? "חיבור Google Calendar עדיין לא הוגדר בשרת."
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setError(null);
    setBusy(true);
    try {
      await disconnectGoogleCalendarApi();
      setLinked(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ניתוק היומן נכשל");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <div className="space-y-3 text-sm" dir="rtl">
      <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
        {linked
          ? "📅 Google Calendar מחובר. משימות עם תאריך מופיעות ביומן שלכם."
          : configured
            ? "חברו את Google Calendar כדי שמשימות עם תאריך יופיעו ביומן Google."
            : "חיבור Google Calendar עדיין לא הוגדר בשרת. אחרי ההגדרה אפשר לחבר מהמסך הזה."}
      </p>
      {error ? <p className="text-red-600">{error}</p> : null}
      {isDemoMode ? (
        <p className="text-slate-500">במצב הדגמה אין חיבור ליומן אמיתי.</p>
      ) : linked ? (
        <button
          type="button"
          onClick={() => void handleDisconnect()}
          disabled={busy}
          className="border border-slate-300 hover:bg-slate-50 disabled:opacity-60"
        >
          {busy ? "מנתק..." : "נתק יומן"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleConnect()}
          disabled={busy || !configured}
          className="border border-slate-300 hover:bg-slate-50 disabled:opacity-60"
        >
          {busy ? "מתחבר..." : "📅 חבר Google Calendar"}
        </button>
      )}
    </div>
  );
}
