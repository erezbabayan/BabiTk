import { FormEvent, useState } from "react";

import { configureGoogleOAuthFromEdge } from "../lib/google-calendar-client";
import {
  GOOGLE_CLOUD_CREDENTIALS_URL,
  googleOAuthSetupPublic,
  looksLikeGoogleClientId,
  looksLikeGoogleClientSecret,
} from "../lib/google-calendar-setup";

export function GoogleOAuthEnable({
  onEnabled,
}: {
  onEnabled?: () => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setup = googleOAuthSetupPublic();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const id = clientId.trim();
    const secret = clientSecret.trim();
    if (!looksLikeGoogleClientId(id) || !looksLikeGoogleClientSecret(secret)) {
      setError("Client ID או Secret לא תקינים.");
      return;
    }
    setBusy(true);
    try {
      await configureGoogleOAuthFromEdge(id, secret);
      setClientSecret("");
      onEnabled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפעלת Google נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3 text-sm" onSubmit={(event) => void handleSubmit(event)}>
      <p className="text-slate-600">
        צרו לקוח Web application ב-Google Cloud, והדביקו כאן רק Client ID ו-Secret. אחרי
        ההפעלה כפתור «התחבר עם Google» במסך הכניסה יעבוד.
      </p>
      <a
        href={GOOGLE_CLOUD_CREDENTIALS_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-block rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
      >
        פתח Google Cloud
      </a>
      <ul className="space-y-1 font-mono text-[11px] text-slate-500" dir="ltr">
        {setup.javascriptOrigins.map((origin) => (
          <li key={origin}>{origin}</li>
        ))}
        <li>{setup.authRedirectUri}</li>
        <li>{setup.calendarRedirectUri}</li>
      </ul>
      {error ? <p className="text-red-600">{error}</p> : null}
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
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
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
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {busy ? "מפעיל..." : "הפעל כניסת Google"}
      </button>
    </form>
  );
}
