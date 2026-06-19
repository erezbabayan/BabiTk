import { FormEvent, useState, type ReactNode } from "react";

import { MindTaskerLogo } from "./MindTaskerLogo";

type AuthMode = "login" | "signup";

interface AuthLoginScreenProps {
  mode: "auth";
  onSubmit: (email: string, password: string, authMode: AuthMode) => Promise<void>;
}

interface DemoLoginScreenProps {
  mode: "demo";
  onEnter: () => void;
}

interface SetupLoginScreenProps {
  mode: "setup";
}

export type LoginScreenProps =
  | AuthLoginScreenProps
  | DemoLoginScreenProps
  | SetupLoginScreenProps;

/** Logo brush colors — left to right in the mark */
const LOGO_ORANGE = "#F97316";
const LOGO_BLUE = "#3B82F6";
const LOGO_WHITE = "#FFFFFF";

function LoginShell({
  children,
  subtitle,
}: {
  children: ReactNode;
  subtitle: string;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white p-4">
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl"
        style={{ backgroundColor: `${LOGO_ORANGE}33` }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full blur-3xl"
        style={{ backgroundColor: `${LOGO_BLUE}33` }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-1/4 -left-12 h-56 w-56 rounded-full border border-black/10 bg-white blur-2xl"
        aria-hidden
      />

      <div className="relative w-full max-w-md">
        <div className="overflow-hidden rounded-2xl border border-black bg-white">
          <div className="flex h-2 border-b border-black" dir="ltr" aria-hidden>
            <span className="flex-1" style={{ backgroundColor: LOGO_ORANGE }} />
            <span
              className="flex-1 border-x border-black"
              style={{ backgroundColor: LOGO_BLUE }}
            />
            <span className="flex-1" style={{ backgroundColor: LOGO_WHITE }} />
          </div>

          <div className="space-y-5 p-6 sm:p-8">
            <div className="flex flex-col items-center gap-2 text-center">
              <MindTaskerLogo size="large" />
              <p className="text-sm text-slate-500">{subtitle}</p>
            </div>

            {children}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          ארגן משימות, הערות ומחברות — במקום אחד
        </p>
      </div>
    </main>
  );
}

function AuthForm({ onSubmit }: { onSubmit: AuthLoginScreenProps["onSubmit"] }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      await onSubmit(email.trim(), password, authMode);
      if (authMode === "signup") {
        setMessage("נרשמת בהצלחה. בדוק את האימייל לאימות (אם נדרש) ואז התחבר.");
        setAuthMode("login");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "התחברות נכשלה");
    } finally {
      setLoading(false);
    }
  }

  function toggleMode() {
    setAuthMode(authMode === "login" ? "signup" : "login");
    setError(null);
    setMessage(null);
  }

  return (
    <LoginShell
      subtitle={authMode === "login" ? "התחברות ללוח הבקרה" : "יצירת חשבון חדש"}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">אימייל</span>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              autoComplete="email"
              dir="ltr"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">סיסמה</span>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              autoComplete={authMode === "login" ? "current-password" : "new-password"}
              dir="ltr"
              required
              minLength={6}
            />
          </label>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? "ממתין..." : authMode === "login" ? "התחבר" : "הירשם"}
        </button>

        <button
          type="button"
          onClick={toggleMode}
          className="w-full py-1 text-sm text-slate-500 hover:text-indigo-600"
        >
          {authMode === "login" ? "אין חשבון? הירשם" : "יש לך חשבון? התחבר"}
        </button>
      </form>
    </LoginShell>
  );
}

function DemoForm({ onEnter }: { onEnter: () => void }) {
  return (
    <LoginShell subtitle="מצב הדגמה מקומי — ללא Supabase">
      <div className="space-y-4">
        <button
          type="button"
          onClick={onEnter}
          className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          כניסה למערכת
        </button>
      </div>
    </LoginShell>
  );
}

function SetupForm() {
  return (
    <LoginShell subtitle="נדרשת הגדרת Supabase">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          השרת רץ, אבל חסרה הגדרת Supabase ללוח הבקרה.
        </p>

        <ol className="list-decimal space-y-2 pr-5 text-sm text-slate-700">
          <li>
            צור קובץ <code className="rounded bg-slate-100 px-1">web/.env</code>
          </li>
          <li>
            העתק מ-<code className="rounded bg-slate-100 px-1">web/.env.example</code>
          </li>
          <li>
            מלא <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> ו-{" "}
            <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code>
          </li>
          <li>רענן את הדף</li>
        </ol>
      </div>
    </LoginShell>
  );
}

export function LoginScreen(props: LoginScreenProps) {
  if (props.mode === "demo") {
    return <DemoForm onEnter={props.onEnter} />;
  }

  if (props.mode === "setup") {
    return <SetupForm />;
  }

  return <AuthForm onSubmit={props.onSubmit} />;
}
