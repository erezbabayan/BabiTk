import { useEffect, useState } from "react";
import {
  disconnectGoogleCalendarApi,
  getGoogleCalendarStatus,
} from "../lib/api";
import {
  getGoogleCalendarHealth,
  startGoogleCalendarConnect,
} from "../lib/google-calendar-client";
import {
  googleOAuthSetupPublic,
  type GoogleCalendarHealth,
} from "../lib/google-calendar-setup";
import { isDemoMode } from "../lib/supabase";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <div className="flex items-start gap-2">
        <code className="block min-w-0 flex-1 break-all rounded-lg bg-white px-2 py-1 text-xs text-slate-800">
          {value}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 border border-slate-300 px-2 py-1 text-xs hover:bg-white"
        >
          {copied ? "הועתק" : "העתק"}
        </button>
      </div>
    </div>
  );
}

export function GoogleCalendarLink() {
  const [linked, setLinked] = useState(false);
  const [health, setHealth] = useState<GoogleCalendarHealth>(() =>
    googleCalendarHealthFromFallback(),
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshStatus() {
    try {
      const [status, nextHealth] = await Promise.all([
        getGoogleCalendarStatus(),
        getGoogleCalendarHealth(),
      ]);
      setLinked(status.linked);
      setHealth(nextHealth);
      if (status.linked) setError(null);
    } catch {
      setLinked(false);
      try {
        setHealth(await getGoogleCalendarHealth());
      } catch {
        setHealth(googleCalendarHealthFromFallback());
      }
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
      await startGoogleCalendarConnect();
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "חיבור היומן נכשל");
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

  const needsServerSetup = !linked && !health.configured;

  return (
    <div className="space-y-3 text-sm" dir="rtl">
      <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
        {linked
          ? "📅 Google Calendar מחובר. משימות עם תאריך יופיעו ביומן שלכם."
          : "חברו את Google Calendar כדי שמשימות עם תאריך יופיעו ביומן Google. אפשר לשנות את החיבור בכל עת בהגדרות."}
      </p>
      {needsServerSetup ? (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-slate-800">
          <p>
            כפתור החיבור פעיל. כדי ש-Google יאשר את ההרשאה צריך לקוח OAuth מסוג
            Web application עם הכתובות האלה (פעם אחת):
          </p>
          <CopyRow label="מקור JavaScript" value={health.javascriptOrigins[0] ?? ""} />
          <CopyRow label="מקור מקומי" value={health.javascriptOrigins[1] ?? ""} />
          <CopyRow label="כתובת הפניה לכניסה" value={health.authRedirectUri} />
          <CopyRow label="כתובת הפניה ליומן" value={health.calendarRedirectUri} />
          {!health.authProviderEnabled ? (
            <p className="text-xs text-slate-600">
              ספק Google בשרת עדיין כבוי. אחרי שמירת Client ID ו-Secret הוא יופעל
              אוטומטית, ואז לחיצה על חבר תפתח את מסך Google.
            </p>
          ) : null}
          <p className="text-xs text-slate-600">
            אחרי יצירת הלקוח הוסיפו ב-GitHub Secrets את{" "}
            <code>GOOGLE_CLIENT_ID</code> ו-<code>GOOGLE_CLIENT_SECRET</code>, או
            הריצו Deploy Supabase Functions עם אותם ערכים. אל תשתפו את הסוד בצ׳אט
            ציבורי.
          </p>
        </div>
      ) : null}
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
          disabled={busy}
          className="border border-slate-300 hover:bg-slate-50 disabled:opacity-60"
        >
          {busy ? "מתחבר..." : "📅 חבר Google Calendar"}
        </button>
      )}
    </div>
  );
}

function googleCalendarHealthFromFallback(): GoogleCalendarHealth {
  const setup = googleOAuthSetupPublic();
  return {
    configured: false,
    authProviderEnabled: false,
    redirectUri: setup.calendarRedirectUri,
    authRedirectUri: setup.authRedirectUri,
    calendarRedirectUri: setup.calendarRedirectUri,
    javascriptOrigins: setup.javascriptOrigins,
    scope: setup.scope,
  };
}
