import { useCallback, useEffect, useState } from "react";

import { useDatedCalendarTasks } from "../hooks/useDatedCalendarTasks";
import { disconnectGoogleCalendarApi, getGoogleCalendarStatus } from "../lib/api";
import {
  GOOGLE_CALENDAR_ADD_BY_URL,
  calendarFromUrlSteps,
  calendarGoogleAppHelpText,
  calendarLinkedHelpText,
  calendarSettingsButtonLabel,
  calendarTestingDeniedUserMessage,
  calendarUnlinkedHelpText,
  googleCalendarAppCapturesAdd,
  isGoogleOauthTestingDenied,
  readGoogleCalendarAdded,
  writeGoogleCalendarAdded,
} from "../lib/google-calendar-connect";
import {
  openGoogleCalendarUrl,
  startGoogleCalendarPrimaryConnect,
} from "../lib/google-calendar-client";
import {
  CALENDAR_OAUTH_ATTEMPT_KEY,
  CALENDAR_OAUTH_ERROR_KEY,
  CALENDAR_OAUTH_INCOMPLETE_MESSAGE,
} from "../lib/google-oauth-errors";
import { isDemoMode } from "../lib/supabase";
import { requestOpenTaskCalendar } from "../lib/task-calendar";
import { GoogleOAuthEnable } from "./GoogleOAuthEnable";
import { TaskMonthCalendar } from "./TaskMonthCalendar";

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

interface GoogleCalendarLinkProps {
  userId?: string;
  onSelectItem?: (itemId: string) => void;
}

export function GoogleCalendarLink({ userId, onSelectItem }: GoogleCalendarLinkProps) {
  const [linked, setLinked] = useState(false);
  const [writable, setWritable] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [canConfigure, setCanConfigure] = useState(false);
  const [eventCount, setEventCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedUrl, setFeedUrl] = useState("");
  const [showFromUrlHelp, setShowFromUrlHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const { items } = useDatedCalendarTasks(userId);

  useEffect(() => {
    if (isDemoMode || linked) setEventCount(items.length);
  }, [items.length, linked]);

  const refreshStatus = useCallback(async () => {
    try {
      if (isDemoMode) {
        const demoLinked = readDemoLinked();
        setLinked(demoLinked);
        setWritable(demoLinked);
        setConfigured(true);
        return;
      }
      const status = await getGoogleCalendarStatus();
      const googleLinked = status.writable === true || readGoogleCalendarAdded();
      setLinked(googleLinked);
      setWritable(status.writable === true);
      setConfigured(status.configured !== false);
      setCanConfigure(status.canConfigure === true);
      setEventCount(status.eventCount ?? 0);
      if (status.writable) {
        setError(null);
        try {
          sessionStorage.removeItem(CALENDAR_OAUTH_ATTEMPT_KEY);
        } catch {
          // ignore
        }
      } else {
        let attempted = false;
        try {
          attempted = sessionStorage.getItem(CALENDAR_OAUTH_ATTEMPT_KEY) === "1";
          if (attempted) sessionStorage.removeItem(CALENDAR_OAUTH_ATTEMPT_KEY);
        } catch {
          attempted = false;
        }
        if (attempted) {
          setError((current) => {
            if (current) return current;
            try {
              const stored = sessionStorage.getItem(CALENDAR_OAUTH_ERROR_KEY);
              if (stored) {
                sessionStorage.removeItem(CALENDAR_OAUTH_ERROR_KEY);
                return stored;
              }
            } catch {
              // ignore
            }
            return status.canConfigure === true
              ? CALENDAR_OAUTH_INCOMPLETE_MESSAGE
              : calendarTestingDeniedUserMessage();
          });
        }
      }
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
      const data = event.data as { type?: string; ok?: boolean; error?: string | null } | null;
      if (data?.type !== "babitk-calendar") return;
      if (data.ok === false && data.error) {
        setError(data.error);
        try {
          sessionStorage.setItem(CALENDAR_OAUTH_ERROR_KEY, data.error);
        } catch {
          // ignore
        }
      }
      void refreshStatus();
    }
    function onFocus() {
      void refreshStatus();
    }
    window.addEventListener("message", onMessage);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
    };
  }, [refreshStatus]);

  async function handleConnect() {
    setError(null);
    setBusy(true);
    try {
      if (isDemoMode) {
        writeDemoLinked(true);
        setLinked(true);
        setWritable(true);
        requestOpenTaskCalendar();
        return;
      }
      const planned = await startGoogleCalendarPrimaryConnect();
      if (planned.kind === "oauth") {
        window.location.assign(planned.url);
        return;
      }
      const feed = planned.feedUrl?.trim() ?? "";
      setFeedUrl(feed);
      setShowFromUrlHelp(true);
      if (feed) {
        try {
          await navigator.clipboard.writeText(feed);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }
      const opensInCalendarApp = googleCalendarAppCapturesAdd(navigator.userAgent);
      if (!opensInCalendarApp) {
        openGoogleCalendarUrl(GOOGLE_CALENDAR_ADD_BY_URL);
      }
      requestOpenTaskCalendar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לחבר את היומן כרגע.");
      requestOpenTaskCalendar();
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
        setWritable(false);
        return;
      }
      writeGoogleCalendarAdded(false);
      setShowFromUrlHelp(false);
      setFeedUrl("");
      await disconnectGoogleCalendarApi();
      setLinked(false);
      setWritable(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא ניתן לבטל את החיבור כרגע.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <div className="space-y-3 text-sm" dir="rtl">
      <p className="text-slate-600">
        יומן BabiTk מציג משימות לפי תאריך. משימות בלי תאריך נשארות בלוח בלבד.
      </p>
      <TaskMonthCalendar
        items={items}
        compact
        onSelectItem={(item) => onSelectItem?.(item.id)}
      />
      {error ? <p className="text-red-600">{error}</p> : null}
      {showFromUrlHelp && !writable ? (
        <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-slate-700">
          <p>{calendarGoogleAppHelpText()}</p>
          <ol className="list-decimal space-y-1 pr-5">
            {calendarFromUrlSteps().map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {feedUrl ? (
            <input
              readOnly
              dir="ltr"
              value={feedUrl}
              aria-label="כתובת היומן"
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs"
              onFocus={(event) => event.currentTarget.select()}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-blue-800 hover:bg-blue-100"
              onClick={() => {
                if (!feedUrl) return;
                void navigator.clipboard.writeText(feedUrl).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
            >
              {copied ? "הכתובת הועתקה" : "העתק כתובת"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50"
              onClick={() => {
                writeGoogleCalendarAdded(true);
                setLinked(true);
                setShowFromUrlHelp(false);
              }}
            >
              הוספתי
            </button>
          </div>
        </div>
      ) : null}
      {!writable && !linked && configured && !showFromUrlHelp ? (
        <p className="text-slate-600">{calendarUnlinkedHelpText()}</p>
      ) : null}
      {writable || linked ? (
        <p className="text-slate-600">
          {calendarLinkedHelpText({
            writable,
            eventCount,
            googleLinked: linked && !writable,
          })}
        </p>
      ) : null}
      {linked && !writable && !showFromUrlHelp ? (
        <p className="text-slate-600">{calendarGoogleAppHelpText()}</p>
      ) : null}
      {error && isGoogleOauthTestingDenied(error) && !canConfigure ? (
        <p className="text-slate-600">{calendarTestingDeniedUserMessage()}</p>
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
      {writable || linked ? (
        <div className="space-y-2">
          {linked && !writable ? (
            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={busy}
              className="relative z-10 w-full rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-blue-800 hover:bg-blue-100 disabled:opacity-60"
            >
              הוספה במחשב ליומן Google
            </button>
          ) : null}
          <button
            type="button"
            data-calendar-linked="true"
            data-calendar-writable={writable ? "true" : "false"}
            onClick={() => void handleDisconnect()}
            disabled={busy}
            className="relative z-10 w-full rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50 disabled:opacity-60"
          >
            {calendarSettingsButtonLabel(true, busy)}
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-calendar-linked={linked ? "true" : "false"}
          data-calendar-writable="false"
          onClick={() => void handleConnect()}
          disabled={busy || !configured}
          className="relative z-10 w-full rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-blue-800 hover:bg-blue-100 disabled:opacity-60"
        >
          {calendarSettingsButtonLabel(false, busy)}
        </button>
      )}
    </div>
  );
}
