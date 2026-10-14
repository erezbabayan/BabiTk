import { FormEvent, useState } from "react";

import {
  GOOGLE_CLOUD_CREDENTIALS_URL,
  googleOAuthSetupPublic,
  looksLikeGoogleClientId,
  looksLikeGoogleClientSecret,
  type GoogleCalendarHealth,
} from "../lib/google-calendar-setup";
import { activateGoogleLogin } from "../lib/google-login-client";
import { readRememberedEmail } from "../lib/auth-storage";
import { CopyRow } from "./CopyRow";
import { PasswordInput } from "./PasswordInput";

export function GoogleLoginSetup({
  health,
  disabled,
  onActivated,
}: {
  health: GoogleCalendarHealth;
  disabled?: boolean;
  onActivated?: () => void;
}) {
  const setup = googleOAuthSetupPublic();
  const [email, setEmail] = useState(() => readRememberedEmail());
  const [password, setPassword] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const id = clientId.trim();
    const secret = clientSecret.trim();
    if (!looksLikeGoogleClientId(id) || !looksLikeGoogleClientSecret(secret)) {
      setError(
        "Client ID או Secret לא תקינים. הדביקו את הערכים מלקוח Web application ב-Google Cloud.",
      );
      return;
    }
    if (!email.trim() || !password) {
      setError("הזינו את האימייל והסיסמה של בעל החשבון כדי להפעיל את Google.");
      return;
    }
    setBusy(true);
    try {
      await activateGoogleLogin({
        email: email.trim(),
        password,
        clientId: id,
        clientSecret: secret,
      });
      setClientSecret("");
      onActivated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפעלת כניסת Google נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-right text-sm text-slate-800">
      <p>
        כניסת Google כבויה בשרת כי חסר לקוח OAuth. צרו לקוח מסוג Web application
        ב-Google Cloud (פעם אחת), הדביקו כאן Client ID ו-Secret, והיכנסו עם סיסמת
        בעל החשבון. אחרי זה הכפתור «התחבר עם Google» יעבוד.
      </p>
      <a
        href={GOOGLE_CLOUD_CREDENTIALS_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-block border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-slate-50"
      >
        יצירת לקוח OAuth
      </a>
      <CopyRow
        label="מקור JavaScript"
        value={health.javascriptOrigins[0] ?? setup.javascriptOrigins[0] ?? ""}
      />
      <CopyRow
        label="מקור מקומי"
        value={health.javascriptOrigins[1] ?? setup.javascriptOrigins[1] ?? ""}
      />
      <CopyRow label="כתובת הפניה לכניסה" value={health.authRedirectUri || setup.authRedirectUri} />
      <CopyRow
        label="כתובת הפניה ליומן"
        value={health.calendarRedirectUri || setup.calendarRedirectUri}
      />
      {error ? <p className="text-red-700">{error}</p> : null}
      <form className="space-y-2" onSubmit={(event) => void handleSubmit(event)}>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">אימייל בעל החשבון</span>
          <input
            type="email"
            dir="ltr"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800"
            required
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">סיסמה</span>
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            minLength={8}
            required
          />
        </label>
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
          disabled={disabled || busy}
          className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? "מפעיל..." : "הפעל כניסת Google והתחבר"}
        </button>
      </form>
    </div>
  );
}
