import { useCallback, useEffect, useState } from "react";

import { disconnectGoogleCalendarApi, getGoogleCalendarStatus } from "../lib/api";
import {
  calendarSettingsButtonLabel,
  isGoogleOauthTestingDenied,
} from "../lib/google-calendar-connect";
import { startGoogleCalendarConnect } from "../lib/google-calendar-client";
import { CALENDAR_OAUTH_ERROR_KEY } from "../lib/google-oauth-errors";
import { isDemoMode } from "../lib/supabase";
import { GoogleOAuthEnable } from "./GoogleOAuthEnable";

const DEMO_LINK_KEY = "babitk-demo-calendar-linked";

function readDemoLinked(): boolean {
  try {
    return localStorage.getItem(DEMO_LINK_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDemoLinked(linked: boolean): void {
  try {
    if (linked) localStorage.setItem(DEMO_LINK_KEY, "1");
    else localStorage.removeItem(DEMO_LINK_KEY);
  } catch {
    // Private mode — keep the in-memory button state only.
  }
}

export function GoogleCalendarLink() {
  const [linked, setLinked] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [canConfigure, setCanConfigure] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      if (isDemoMode) {
        setLinked(readDemoLinked());
        return;
      }
      const status = await getGoogleCalendarStatus();
      setLinked(status.linked);
      setConfigured(status.configured !== false);
      setCanConfigure(status.canConfigure === true);
      if (status.linked) setError(null);
    } catch {
      setLinked(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(CALENDAR_OAUTH_ERROR_KEY);
      if (stored) {
        setError(stored);
        sessionStorage.removeItem(CALENDAR_OAUTH_ERROR_KEY);
      }
    } catch {
      // ignore
    }
    void refreshStatus();
  }, [refreshStatus]);

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
  }, [refreshStatus]);

  async function handleConnect() {
    setError(null);
    setBusy(true);
    try {
      if (isDemoMode) {
        writeDemoLinked(true);
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
        writeDemoLinked(false);
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
      {!linked && configured ? (
        <p className="text-slate-600">
          «חבר» מוסיף יומן BabiTk ל-Google Calendar. Google חסם הרשאת כתיבה ישירה במצב בדיקות,
          לכן המשימות מגיעות כהזנת יומן בלי access_denied:403.
        </p>
      ) : null}
      {error && isGoogleOauthTestingDenied(error) ? (
        <p className="text-slate-600">לחצו «חבר» שוב — החיבור עובר עכשיו דרך יומן Google בלי אימות אפליקציה.</p>
      ) : null}
      {canConfigure && !configured ? (
        <GoogleOAuthEnable
          onEnabled={() => {
            setConfigured(true);
            setError(null);
          }}
        />
      ) : null}
      {!configured && !canConfigure ? (
        <p className="text-slate-600">חיבור היומן עדיין לא זמין. אפשר להמשיך להשתמש בלוח בינתיים.</p>
      ) : null}
      {linked ? (
        <button
          type="button"
          data-calendar-linked="true"
          onClick={() => void handleDisconnect()}
          disabled={busy}
          className="relative z-10 rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50 disabled:opacity-60"
        >
          {calendarSettingsButtonLabel(true, busy)}
        </button>
      ) : (
        <button
          type="button"
          data-calendar-linked="false"
          onClick={() => void handleConnect()}
          disabled={busy || !configured}
          className="relative z-10 rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50 disabled:opacity-60"
        >
          {calendarSettingsButtonLabel(false, busy)}
        </button>
      )}
    </div>
  );
}
