import { useEffect, useState } from "react";
import {
  disconnectGoogleCalendarApi,
  getGoogleCalendarStatus,
} from "../lib/api";
import {
  configureGoogleCalendarOAuth,
  getGoogleCalendarHealth,
  startGoogleCalendarConnect,
} from "../lib/google-calendar-client";
import {
  GOOGLE_CLOUD_CALENDAR_API_URL,
  GOOGLE_CLOUD_CREDENTIALS_URL,
  googleOAuthSetupPublic,
  looksLikeGoogleClientId,
  looksLikeGoogleClientSecret,
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
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

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

  async function handleActivateAndConnect() {
    setError(null);
    const id = clientId.trim();
    const secret = clientSecret.trim();
    if (!looksLikeGoogleClientId(id) || !looksLikeGoogleClientSecret(secret)) {
      setError(
        "Client ID או Secret לא תקינים. הדביקו את הערכים מלקוח Web application ב-Google Cloud.",
      );
      return;
    }
    setBusy(true);
    try {
      await configureGoogleCalendarOAuth(id, secret);
      setClientSecret("");
      await startGoogleCalendarConnect();
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפעלת חיבור היומן נכשלה");
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
      {error ? <p className="text-red-600">{error}</p> : null}
      {isDemoMode ? (
        <p className="text-slate-500">במצב הדגמה אין חיבור ליומן אמיתי.</p>
      ) : linked ? (
        <button
          type="button"
          onClick={() => void handleDisconnect()}
          disabled={busy}
          className="relative z-10 border border-slate-300 hover:bg-slate-50 disabled:opacity-60"
        >
          {busy ? "מנתק..." : "נתק יומן"}
        </button>
      ) : needsServerSetup ? null : (
        <button
          type="button"
          onClick={() => void handleConnect()}
          disabled={busy}
          className="relative z-10 border border-slate-300 hover:bg-slate-50 disabled:opacity-60"
        >
          {busy ? "מתחבר..." : "📅 חבר Google Calendar"}
        </button>
      )}
      {needsServerSetup ? (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-slate-800">
          <p>
            כדי לחבר את היומן צרו לקוח OAuth מסוג Web application ב-Google Cloud
            (פעם אחת), הדביקו כאן את Client ID ו-Secret, ואז לחצו «הפעל וחבר».
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <a
              href={GOOGLE_CLOUD_CALENDAR_API_URL}
              target="_blank"
              rel="noreferrer"
              className="border border-slate-300 bg-white px-2 py-1 text-slate-800 hover:bg-slate-50"
            >
              הפעלת Calendar API
            </a>
            <a
              href={GOOGLE_CLOUD_CREDENTIALS_URL}
              target="_blank"
              rel="noreferrer"
              className="border border-slate-300 bg-white px-2 py-1 text-slate-800 hover:bg-slate-50"
            >
              יצירת לקוח OAuth
            </a>
          </div>
          <CopyRow label="מקור JavaScript" value={health.javascriptOrigins[0] ?? ""} />
          <CopyRow label="מקור מקומי" value={health.javascriptOrigins[1] ?? ""} />
          <CopyRow label="כתובת הפניה לכניסה" value={health.authRedirectUri} />
          <CopyRow label="כתובת הפניה ליומן" value={health.calendarRedirectUri} />
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleActivateAndConnect();
            }}
          >
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Client ID</span>
              <input
                type="text"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder="....apps.googleusercontent.com"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Client Secret</span>
              <input
                type="password"
                dir="ltr"
                autoComplete="off"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                placeholder="GOCSPX-..."
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="relative z-10 border border-slate-800 bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {busy ? "מפעיל..." : "הפעל וחבר"}
            </button>
          </form>
        </div>
      ) : null}
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
