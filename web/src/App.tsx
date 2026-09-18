import { useEffect, useState, useCallback } from "react";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { LocalBackendBanner } from "./components/LocalBackendBanner";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./components/Dashboard";
import { LoginScreen } from "./components/LoginScreen";
import { PaywallModal } from "./components/PaywallModal";
import { SettingsPanel } from "./components/SettingsPanel";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { useUsage } from "./hooks/useUsage";
import { useHeaderUserName } from "./hooks/useHeaderUserName";
import { ingestTextApi, registerPaywallHandler } from "./lib/api";
import { DEMO_USER_ID, ensureLocalSeedItems } from "./lib/demo-store";
import { clearAuthSessionCaches } from "./lib/clear-auth-caches";
import {
  applyRememberMePreference,
  persistLoginDetails,
} from "./lib/auth-storage";
import { isSyncEnabled } from "./lib/sync-client";
import { persistGoogleCalendarSessionLink } from "./lib/google-calendar-client";
import { isDemoMode, isSupabaseConfigured, requireSupabase, supabaseAuthRedirectUrl } from "./lib/supabase";
import { writeCachedHeaderName } from "./lib/header-name-cache";
import { normalizeLoginIdentifier } from "./lib/login-aliases";
import { resolveLoginEmail } from "./lib/resolve-login-email";
import { signInWithGoogle } from "./lib/google-auth";
import {
  formatOAuthSignInError,
  readOAuthCallback,
  stripOAuthParamsFromUrl,
} from "./lib/auth-redirect";
import type { UserNameParts } from "./lib/user-display-name";
import { UserTagsProvider } from "./providers/UserTagsProvider";

const DEMO_HEADER_NAME: UserNameParts = { firstName: "משתמש", lastName: "הדגמה" };
const OAUTH_CODE_GUARD_KEY = "mindtasker:oauth-code";

export default function App() {
  if (isSupabaseConfigured) {
    return (
      <ErrorBoundary>
        <ConfiguredApp />
      </ErrorBoundary>
    );
  }

  if (isDemoMode) {
    return (
      <ErrorBoundary>
        <DemoApp />
      </ErrorBoundary>
    );
  }

  return <LoginScreen mode="setup" />;
}

function DemoApp() {
  const [userId, setUserId] = useState<string | null>(() =>
    sessionStorage.getItem("mindtasker:demo:user"),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallCode, setPaywallCode] = useState<"audio_quota" | "ai_parse_quota" | null>(null);
  const { summary, refresh: refreshUsage } = useUsage(Boolean(userId));
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [captureTick, setCaptureTick] = useState(0);
  const [homeResetTick, setHomeResetTick] = useState(0);
  const headerUserName = useHeaderUserName({ userId, fallback: DEMO_HEADER_NAME });

  const goHome = useCallback(() => {
    setSettingsOpen(false);
    setPaywallOpen(false);
    setHomeResetTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");

    if (billing === "success") {
      setBillingNotice("המנוי הופעל בהצלחה! ברוך הבא ל-Premium.");
      void refreshUsage();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (billing === "cancel" || billing === "canceled") {
      setBillingNotice("המנוי בוטל.");
      void refreshUsage();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [refreshUsage]);

  useEffect(() => {
    registerPaywallHandler((code) => {
      setPaywallCode(code);
      setPaywallOpen(true);
      void refreshUsage();
    });
    return () => registerPaywallHandler(null);
  }, [refreshUsage]);

  async function enterDemo() {
    await ensureLocalSeedItems();
    sessionStorage.setItem("mindtasker:demo:user", DEMO_USER_ID);
    setUserId(DEMO_USER_ID);
  }

  function exitDemo() {
    sessionStorage.removeItem("mindtasker:demo:user");
    setUserId(null);
  }

  if (!userId) {
    return <LoginScreen mode="demo" onEnter={enterDemo} />;
  }

  return (
    <UserTagsProvider userId={userId}>
    <AppShell
      userName={headerUserName}
      userId={userId}
      onLogoClick={goHome}
      onSettings={() => setSettingsOpen(true)}
      onLogout={exitDemo}
      onCaptured={() => setCaptureTick((t) => t + 1)}
      beforeMain={
        <>
          <LocalBackendBanner />
          {settingsOpen && userId ? (
            <SettingsPanel
              userId={userId}
              summary={summary}
              cloudAccount={false}
              onOpenPaywall={() => {
                setPaywallCode(null);
                setPaywallOpen(true);
              }}
              onUsageChanged={() => void refreshUsage()}
              onClose={() => setSettingsOpen(false)}
            />
          ) : null}
          {billingNotice ? (
            <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm text-emerald-800">
              {billingNotice}
            </div>
          ) : null}
          {isSyncEnabled() ? (
            <div className="flex items-center justify-center border-b border-indigo-200 bg-indigo-50 px-4 py-2">
              <p className="text-center text-xs font-medium text-indigo-700">
                מסונכרן עם האפליקציה — אותם נתונים בין מחשב לטלפון
              </p>
            </div>
          ) : null}
        </>
      }
    >
      <ErrorBoundary>
        <Dashboard userId={userId} refreshTick={captureTick} homeResetTick={homeResetTick} />
      </ErrorBoundary>

      <PaywallModal
        open={paywallOpen}
        code={paywallCode}
        summary={summary}
        onClose={() => setPaywallOpen(false)}
        onUpgraded={(tier) => {
          setBillingNotice(
            tier === "premium" ? "המנוי Premium הופעל." : "עברת לחשבון רגיל.",
          );
          void refreshUsage();
        }}
      />
    </AppShell>
    </UserTagsProvider>
  );
}

function ConfiguredApp() {
  const supabase = requireSupabase();
  const [userId, setUserId] = useState<string | null>(null);
  const [userMetadata, setUserMetadata] = useState<Record<string, unknown> | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"menu" | "calendar">("menu");
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallCode, setPaywallCode] = useState<"audio_quota" | "ai_parse_quota" | null>(null);
  const { summary, refresh: refreshUsage } = useUsage(Boolean(userId));
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [captureTick, setCaptureTick] = useState(0);
  const [homeResetTick, setHomeResetTick] = useState(0);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);
  const headerUserName = useHeaderUserName({ userId, userMetadata });

  const goHome = useCallback(() => {
    setSettingsOpen(false);
    setSettingsSection("menu");
    setPaywallOpen(false);
    setHomeResetTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    const calendar = params.get("calendar");
    let replaced = false;

    if (billing === "success") {
      setBillingNotice("המנוי הופעל בהצלחה! ברוך הבא ל-Premium.");
      void refreshUsage();
      params.delete("billing");
      replaced = true;
    } else if (billing === "cancel") {
      setBillingNotice("התשלום בוטל.");
      params.delete("billing");
      replaced = true;
    }

    if (calendar === "connected") {
      setSettingsOpen(true);
      setSettingsSection("calendar");
      setBillingNotice("Google Calendar מחובר. משימות עם תאריך יופיעו ביומן.");
      params.delete("calendar");
      replaced = true;
      void persistGoogleCalendarSessionLink(true).catch((error) => {
        console.warn(
          "[calendar] persist link failed:",
          error instanceof Error ? error.message : String(error),
        );
      });
    } else if (calendar === "error") {
      setSettingsOpen(true);
      setSettingsSection("calendar");
      setBillingNotice("חיבור Google Calendar לא הושלם. אפשר לנסות שוב בהגדרות.");
      params.delete("calendar");
      replaced = true;
    }

    if (replaced) {
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
      );
    }
  }, [refreshUsage]);

  useEffect(() => {
    if (!userId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("code")) return;
    const shared = [params.get("text"), params.get("title"), params.get("url")]
      .filter((value): value is string => Boolean(value?.trim()))
      .join("\n")
      .trim();
    if (!shared) return;
    void ingestTextApi(shared)
      .then(() => {
        setCaptureTick((tick) => tick + 1);
        setBillingNotice("נקלט מהשיתוף.");
      })
      .catch(() => {
        setBillingNotice("לא ניתן לקלוט את השיתוף.");
      })
      .finally(() => {
        window.history.replaceState({}, "", window.location.pathname);
      });
  }, [userId]);

  useEffect(() => {
    registerPaywallHandler((code) => {
      setPaywallCode(code);
      setPaywallOpen(true);
      void refreshUsage();
    });
    return () => registerPaywallHandler(null);
  }, [refreshUsage]);

  useEffect(() => {
    const callback = readOAuthCallback(window.location.search, window.location.hash);
    if (callback.error) {
      setOauthNotice(
        formatOAuthSignInError(callback.error, callback.errorDescription),
      );
    }

    const finishUrl = () => {
      if (!callback.code && !callback.error) return;
      window.history.replaceState(
        {},
        "",
        stripOAuthParamsFromUrl(window.location.href),
      );
    };

    void supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!data.session && callback.code) {
          let alreadyTried = false;
          try {
            alreadyTried = sessionStorage.getItem(OAUTH_CODE_GUARD_KEY) === callback.code;
            sessionStorage.setItem(OAUTH_CODE_GUARD_KEY, callback.code);
          } catch {
            alreadyTried = false;
          }
          if (!alreadyTried) {
            const { error } = await supabase.auth.exchangeCodeForSession(callback.code);
            if (error) {
              setOauthNotice(formatOAuthSignInError(error, callback.errorDescription));
            }
          }
        }
        const { data: next } = await supabase.auth.getSession();
        const nextUser = next.session?.user;
        setUserId(nextUser?.id ?? null);
        setUserMetadata(nextUser?.user_metadata ?? null);
        if (callback.code && nextUser?.email) {
          persistLoginDetails(true, nextUser.email);
        }
        finishUrl();
      })
      .catch((error) => {
        console.warn(
          "[auth] getSession failed:",
          error instanceof Error ? error.message : String(error),
        );
        setUserId(null);
        setUserMetadata(null);
        finishUrl();
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setUserMetadata(session?.user.user_metadata ?? null);
      if (session?.user.id) {
        void persistGoogleCalendarSessionLink().catch((error) => {
          console.warn(
            "[calendar] persist link failed:",
            error instanceof Error ? error.message : String(error),
          );
        });
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  async function handleAuth(
    email: string,
    password: string,
    authMode: "login" | "signup",
    rememberMe = true,
    signupDetails?: { firstName: string; lastName: string; phone: string; username?: string },
  ) {
    if (authMode === "login") {
      const loginEmail = await resolveLoginEmail(email);
      applyRememberMePreference(rememberMe, loginEmail);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });
      if (signInError) throw signInError;
      persistLoginDetails(rememberMe, loginEmail);
      return;
    }

    if (!signupDetails) {
      throw new Error("יש להזין שם, שם משפחה וטלפון");
    }

    const normalizedEmail = normalizeLoginIdentifier(email);
    if (!normalizedEmail.includes("@")) {
      throw new Error("בהרשמה יש להזין אימייל תקין בנוסף לשם המשתמש");
    }
    applyRememberMePreference(rememberMe, normalizedEmail);
    const username = signupDetails.username?.trim();

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: supabaseAuthRedirectUrl(),
        data: {
          first_name: signupDetails.firstName,
          last_name: signupDetails.lastName,
          phone: signupDetails.phone,
          username,
          full_name: [signupDetails.firstName, signupDetails.lastName]
            .filter(Boolean)
            .join(" "),
        },
      },
    });
    if (signUpError) throw signUpError;
    if (!signUpData.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (signInError) throw signInError;
    }

    if (username) {
      const { data: sessionData } = await supabase.auth.getSession();
      const userIdFromSession = sessionData.session?.user.id;
      if (userIdFromSession) {
        const { error: usernameError } = await supabase
          .from("users")
          .update({ username })
          .eq("id", userIdFromSession);
        if (usernameError) {
          throw new Error(usernameError.message || "שם המשתמש כבר תפוס");
        }
      }
    }

    persistLoginDetails(rememberMe, normalizedEmail);
    writeCachedHeaderName(
      {
        firstName: signupDetails.firstName,
        lastName: signupDetails.lastName,
      },
      userId ?? undefined,
    );
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    clearAuthSessionCaches();
  }

  if (!userId) {
    return (
      <LoginScreen
        mode="auth"
        onSubmit={handleAuth}
        onGoogleSignIn={() => signInWithGoogle(supabase)}
        notice={oauthNotice}
        subtitle="התחברו עם Google או עם המשתמש שלכם — כל חשבון עם לוח נפרד"
        usernameLabel="שם משתמש או אימייל"
        signupAutoSignIn
        showRememberMe
      />
    );
  }

  return (
    <UserTagsProvider userId={userId}>
    <AppShell
      userName={headerUserName}
      userId={userId}
      onLogoClick={goHome}
      onSettings={() => setSettingsOpen(true)}
      onLogout={() => void handleLogout()}
      onCaptured={() => setCaptureTick((t) => t + 1)}
      beforeMain={
        <>
          {settingsOpen && userId ? (
            <SettingsPanel
              userId={userId}
              summary={summary}
              cloudAccount
              initialSection={settingsSection}
              onOpenPaywall={() => {
                setPaywallCode(null);
                setPaywallOpen(true);
              }}
              onUsageChanged={() => void refreshUsage()}
              onClose={() => {
                setSettingsOpen(false);
                setSettingsSection("menu");
              }}
            />
          ) : null}
          <OnboardingWizard enabled={Boolean(userId)} userId={userId} summary={summary} />
          {billingNotice ? (
            <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm text-emerald-800">
              {billingNotice}
            </div>
          ) : null}
          {isSyncEnabled() ? (
            <div className="flex items-center justify-center border-b border-indigo-200 bg-indigo-50 px-4 py-2">
              <p className="text-center text-xs font-medium text-indigo-700">
                מסונכרן עם האפליקציה — אותם נתונים בין מחשב לטלפון
              </p>
            </div>
          ) : null}
        </>
      }
    >
      <ErrorBoundary>
        <Dashboard userId={userId} refreshTick={captureTick} homeResetTick={homeResetTick} />
      </ErrorBoundary>

      <PaywallModal
        open={paywallOpen}
        code={paywallCode}
        summary={summary}
        onClose={() => setPaywallOpen(false)}
        onUpgraded={(tier) => {
          setBillingNotice(
            tier === "premium" ? "המנוי Premium הופעל." : "עברת לחשבון רגיל.",
          );
          void refreshUsage();
        }}
      />
    </AppShell>
    </UserTagsProvider>
  );
}
