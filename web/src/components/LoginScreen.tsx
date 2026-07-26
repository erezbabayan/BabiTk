import { FormEvent, useState, type ReactNode } from "react";

import { readRememberMe, readRememberedEmail } from "../lib/auth-storage";
import { type SignupDetails, validateSignupDetails } from "../lib/signup-details";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { MindTaskerLogo } from "./MindTaskerLogo";
import { PasswordInput } from "./PasswordInput";

type AuthMode = "login" | "signup";

interface AuthLoginScreenProps {
  mode: "auth";
  onSubmit: (
    email: string,
    password: string,
    authMode: AuthMode,
    rememberMe?: boolean,
    signupDetails?: SignupDetails,
  ) => Promise<void>;
  onGoogleSignIn?: () => Promise<void>;
  onMicrosoftSignIn?: () => Promise<void>;
  subtitle?: string;
  showEmailForm?: boolean;
  usernameLabel?: string;
  allowSignup?: boolean;
  /** Convex Auth signs in immediately after signup — skip "now log in" prompt. */
  signupAutoSignIn?: boolean;
  showRememberMe?: boolean;
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

function AuthForm({
  onSubmit,
  onGoogleSignIn,
  onMicrosoftSignIn,
  subtitle,
  showEmailForm = true,
  usernameLabel = "אימייל / שם משתמש",
  allowSignup = true,
  signupAutoSignIn = false,
  showRememberMe = false,
}: {
  onSubmit: AuthLoginScreenProps["onSubmit"];
  onGoogleSignIn?: AuthLoginScreenProps["onGoogleSignIn"];
  onMicrosoftSignIn?: AuthLoginScreenProps["onMicrosoftSignIn"];
  subtitle?: AuthLoginScreenProps["subtitle"];
  showEmailForm?: AuthLoginScreenProps["showEmailForm"];
  usernameLabel?: AuthLoginScreenProps["usernameLabel"];
  allowSignup?: AuthLoginScreenProps["allowSignup"];
  signupAutoSignIn?: AuthLoginScreenProps["signupAutoSignIn"];
  showRememberMe?: AuthLoginScreenProps["showRememberMe"];
}) {
  const [email, setEmail] = useState(() => readRememberedEmail());
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [rememberMe, setRememberMe] = useState(() => readRememberMe());
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      let signupDetails: SignupDetails | undefined;
      if (authMode === "signup") {
        signupDetails = {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
        };
        validateSignupDetails(signupDetails);
      }

      await onSubmit(email.trim(), password, authMode, rememberMe, signupDetails);
      if (authMode === "signup" && !signupAutoSignIn) {
        setMessage("נרשמת בהצלחה! עכשיו אפשר להתחבר עם אותו אימייל וסיסמה.");
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
    setFirstName("");
    setLastName("");
    setPhone("");
    setError(null);
    setMessage(null);
  }

  async function handleGoogleSignIn() {
    if (!onGoogleSignIn) return;
    setError(null);
    setMessage(null);
    setOauthLoading(true);
    try {
      await onGoogleSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "התחברות Google נכשלה");
    } finally {
      setOauthLoading(false);
    }
  }

  async function handleMicrosoftSignIn() {
    if (!onMicrosoftSignIn) return;
    setError(null);
    setMessage(null);
    setOauthLoading(true);
    try {
      await onMicrosoftSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "התחברות Microsoft נכשלה");
    } finally {
      setOauthLoading(false);
    }
  }

  const busy = loading || oauthLoading;
  const hasOAuth = Boolean(onGoogleSignIn || onMicrosoftSignIn);

  return (
    <LoginShell
      subtitle={
        subtitle ??
        (onGoogleSignIn && authMode === "login"
          ? "התחבר עם חשבון Google שלך"
          : authMode === "login"
            ? "התחברות ללוח הבקרה"
            : "יצירת חשבון חדש")
      }
    >
      <div className="space-y-4">
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>
        ) : null}

        {onGoogleSignIn ? (
          <GoogleSignInButton
            onClick={() => void handleGoogleSignIn()}
            disabled={busy}
            loading={oauthLoading}
          />
        ) : null}

        {hasOAuth && onMicrosoftSignIn ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleMicrosoftSignIn()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            <span aria-hidden>Ⓜ</span>
            {oauthLoading ? "מתחבר..." : "התחבר עם Microsoft"}
          </button>
        ) : null}

        {onGoogleSignIn ? (
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400">או עם אימייל וסיסמה</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        ) : null}

        {showEmailForm ? (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-3">
              {authMode === "signup" ? (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">שם פרטי</span>
                    <input
                      type="text"
                      placeholder="ישראל"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                      autoComplete="given-name"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">שם משפחה</span>
                    <input
                      type="text"
                      placeholder="ישראלי"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                      autoComplete="family-name"
                      required
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">טלפון</span>
                    <input
                      type="tel"
                      placeholder="050-1234567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                      autoComplete="tel"
                      dir="ltr"
                      required
                    />
                  </label>
                </>
              ) : null}

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">{usernameLabel}</span>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                  autoComplete="username email"
                  dir="ltr"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">סיסמה</span>
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  minLength={8}
                  required
                />
              </label>
            </div>

            {showRememberMe && authMode === "login" ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                זכור אותי במכשיר זה
              </label>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? "ממתין..." : authMode === "login" ? "התחבר" : "הירשם"}
            </button>
          </form>
        ) : null}

        {allowSignup ? (
          <button
            type="button"
            onClick={toggleMode}
            className="w-full py-1 text-sm text-slate-500 hover:text-indigo-600"
          >
            {authMode === "login" ? "אין חשבון? הירשם" : "יש לך חשבון? התחבר"}
          </button>
        ) : null}
      </div>
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
            הרץ <code className="rounded bg-slate-100 px-1">.\scripts\setup-supabase.ps1</code>
          </li>
          <li>
            הרץ <code className="rounded bg-slate-100 px-1">.\scripts\setup-google-auth.ps1</code> להנחיות Google
          </li>
          <li>
            הרץ <code className="rounded bg-slate-100 px-1">.\scripts\setup-azure-auth.ps1</code> להנחיות Microsoft
          </li>
          <li>
            מלא <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_URL</code> ו-{" "}
            <code className="rounded bg-slate-100 px-1">VITE_SUPABASE_ANON_KEY</code> ב-{" "}
            <code className="rounded bg-slate-100 px-1">web/.env</code>
          </li>
          <li>הגדר <code className="rounded bg-slate-100 px-1">VITE_DEMO_MODE=false</code></li>
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

  return (
    <AuthForm
      onSubmit={props.onSubmit}
      onGoogleSignIn={props.onGoogleSignIn}
      onMicrosoftSignIn={props.onMicrosoftSignIn}
      subtitle={props.subtitle}
      showEmailForm={props.showEmailForm}
      usernameLabel={props.usernameLabel}
      allowSignup={props.allowSignup}
      signupAutoSignIn={props.signupAutoSignIn}
      showRememberMe={props.showRememberMe}
    />
  );
}
