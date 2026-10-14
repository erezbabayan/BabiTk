import { useEffect, useState } from "react";

import { disconnectGoogleCalendarApi, getGoogleCalendarStatus } from "../lib/api";
import { calendarSettingsButtonLabel } from "../lib/google-calendar-connect";
import { startGoogleCalendarConnect } from "../lib/google-calendar-client";
import { isDemoMode } from "../lib/supabase";

const DEMO_LINK_KEY = "babitk-demo-calendar-linked";

export function GoogleCalendarLink() {
  const [linked, setLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshStatus() {
    try {
      if (isDemoMode) {
        setLinked(localStorage.getItem(DEMO_LINK_KEY) === "1");
        return;
      }
      const status = await getGoogleCalendarStatus();
      setLinked(status.linked);
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
      const data = event.data as { type?: string } | null;
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
      if (isDemoMode) {
        localStorage.setItem(DEMO_LINK_KEY, "1");
        setLinked(true);
        return;
      }
      await startGoogleCalendarConnect();
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לחבר את היומן כרגע.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setError(null);
    setBusy(true);
    try {
      if (isDemoMode) {
        localStorage.removeItem(DEMO_LINK_KEY);
        setLinked(false);
        return;
      }
      await disconnectGoogleCalendarApi();
      setLinked(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לבטל את החיבור כרגע.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <div className="space-y-3 text-sm" dir="rtl">
      {error ? <p className="text-red-600">{error}</p> : null}
      {linked ? (
        <button
          type="button"
          onClick={() => void handleDisconnect()}
          disabled={busy}
          className="relative z-10 border border-slate-300 hover:bg-slate-50 disabled:opacity-60"
        >
          {calendarSettingsButtonLabel(true, busy)}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void handleConnect()}
          disabled={busy}
          className="relative z-10 border border-slate-300 hover:bg-slate-50 disabled:opacity-60"
        >
          {calendarSettingsButtonLabel(false, busy)}
        </button>
      )}
    </div>
  );
}
