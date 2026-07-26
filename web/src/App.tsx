import { useEffect, useState, useCallback } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppShell } from "./components/AppShell";
import { Dashboard } from "./components/Dashboard";
import { LoginScreen } from "./components/LoginScreen";
import { PaywallModal } from "./components/PaywallModal";
import { SettingsPanel } from "./components/SettingsPanel";
import { useUsage } from "./hooks/useUsage";
import { useHeaderUserName } from "./hooks/useHeaderUserName";
import { shouldUseConvexAuthLogin } from "./lib/auth-mode";
import { registerPaywallHandler } from "./lib/api";
import { DEMO_USER_ID, ensureLocalSeedItems } from "./lib/demo-store";
import { clearAuthSessionCaches } from "./lib/clear-auth-caches";
import {
  applyRememberMePreference,
  clearCachedAuthUserId,
  clearConvexAuthTokens,
  persistLoginDetails,
  readCachedAuthUserId,
  writeCachedAuthUserId,
} from "./lib/auth-storage";
import { formatConvexAuthError } from "./lib/auth-errors";
import {
  convexHealthMessage,
  probeConvexHealth,
  type ConvexHealth,
} from "./lib/convex-health";
import { isSyncEnabled } from "./lib/sync-client";
import { isDemoMode, isSupabaseConfigured, requireSupabase } from "./lib/supabase";
import { signInWithMicrosoft } from "./lib/microsoft-auth";
import { writeCachedHeaderName, readCachedHeaderName } from "./lib/header-name-cache";
import type { UserNameParts } from "./lib/user-display-name";
import { UserTagsProvider } from "./providers/UserTagsProvider";

const DEMO_HEADER_NAME: UserNameParts = { firstName: "משתמש", lastName: "הדגמה" };

export default function App() {
  if (isDemoMode) {
    return (
      <ErrorBoundary>
        <DemoApp />
      </ErrorBoundary>
    );
  }

  if (isSupabaseConfigured) {
    return (
      <ErrorBoundary>
        <ConfiguredApp />
      </ErrorBoundary>
    );
  }

  if (shouldUseConvexAuthLogin()) {
    return (
      <ErrorBoundary>
        <ConvexAuthApp />
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
          {settingsOpen && userId ? (
            <SettingsPanel
              userId={userId}
              summary={summary}
              onOpenPaywall={() => {
                setPaywallCode(null);
                setPaywallOpen(true);
              }}
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
        onUpgraded={() => void refreshUsage()}
      />
    </AppShell>
    </UserTagsProvider>
  );
}

function ConvexAuthApp() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const viewer = useQuery(api.users.viewer);
  const updateDisplayName = useMutation(api.users.updateDisplayName);
  const ensureDisplayName = useMutation(api.users.ensureDisplayName);
  const [cachedUserId, setCachedUserId] = useState<string | null>(readCachedAuthUserId);
  const [enteringApp, setEnteringApp] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallCode, setPaywallCode] = useState<"audio_quota" | "ai_parse_quota" | null>(null);
  const [backendHealth, setBackendHealth] = useState<ConvexHealth | null>(null);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const userId = viewer?.userId ?? cachedUserId;
  const headerUserName = useHeaderUserName({ userId, viewer });
  const profileMissing = isAuthenticated && viewer === null;
  const hasCachedSession = Boolean(cachedUserId);
  const backendDown = backendHealth !== null && !backendHealth.ok;
  // Don't stay forever on splash/board when Convex is dead or auth never resolves.
  const inApp =
    !backendDown &&
    !authTimedOut &&
    (isAuthenticated || enteringApp || (isLoading && hasCachedSession));
  const { summary, refresh: refreshUsage } = useUsage(Boolean(userId) && !backendDown);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [captureTick, setCaptureTick] = useState(0);
  const [homeResetTick, setHomeResetTick] = useState(0);

  useEffect(() => {
    const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim() ?? "";
    let cancelled = false;
    void probeConvexHealth(convexUrl).then((health) => {
      if (!cancelled) setBackendHealth(health);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLoading || backendDown) {
      setAuthTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setAuthTimedOut(true);
      clearCachedAuthUserId();
      setCachedUserId(null);
      clearAuthSessionCaches();
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [isLoading, backendDown]);

  useEffect(() => {
    if (isAuthenticated) {
      setEnteringApp(true);
    } else if (!isLoading) {
      setEnteringApp(false);
    }
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (viewer?.userId) {
      writeCachedAuthUserId(viewer.userId);
      setCachedUserId(viewer.userId);
    }
  }, [viewer?.userId]);

  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      clearCachedAuthUserId();
      setCachedUserId(null);
      clearAuthSessionCaches();
    }
  }, [isAuthenticated, isLoading]);

  const goHome = useCallback(() => {
    setSettingsOpen(false);
    setPaywallOpen(false);
    setHomeResetTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    registerPaywallHandler((code) => {
      setPaywallCode(code);
      setPaywallOpen(true);
      void refreshUsage();
    });
    return () => registerPaywallHandler(null);
  }, [refreshUsage]);

  useEffect(() => {
    if (!isAuthenticated || !userId || viewer === undefined) return;
    if (viewer?.firstName?.trim() && viewer?.lastName?.trim()) return;

    const cached = readCachedHeaderName(userId);
    void ensureDisplayName({
      firstName: cached?.firstName,
      lastName: cached?.lastName,
    }).catch((error) => {
      console.warn("Failed to ensure display name", error);
    });
  }, [isAuthenticated, userId, viewer, ensureDisplayName]);

  async function handleAuth(
    email: string,
    password: string,
    authMode: "login" | "signup",
    rememberMe = true,
    signupDetails?: { firstName: string; lastName: string; phone: string },
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    applyRememberMePreference(rememberMe, normalizedEmail);

    try {
      const result = await signIn("password", {
        email: normalizedEmail,
        password,
        flow: authMode === "signup" ? "signUp" : "signIn",
        ...(authMode === "signup" && signupDetails
          ? {
              firstName: signupDetails.firstName,
              lastName: signupDetails.lastName,
              phone: signupDetails.phone,
            }
          : {}),
      });
      if (!result.signingIn && authMode === "login") {
        throw new Error("Invalid credentials");
      }
      if (!result.signingIn && authMode === "signup") {
        throw new Error("Account already exists");
      }
      persistLoginDetails(rememberMe, normalizedEmail);
    } catch (error) {
      throw new Error(formatConvexAuthError(error, authMode));
    }

    if (authMode === "signup" && signupDetails) {
      writeCachedHeaderName(
        {
          firstName: signupDetails.firstName,
          lastName: signupDetails.lastName,
        },
        userId ?? undefined,
      );
      try {
        await updateDisplayName({
          firstName: signupDetails.firstName,
          lastName: signupDetails.lastName,
        });
      } catch (error) {
        console.warn("Failed to persist display name after signup", error);
        try {
          await ensureDisplayName({
            firstName: signupDetails.firstName,
            lastName: signupDetails.lastName,
          });
        } catch (retryError) {
          console.warn("Failed to ensure display name after signup", retryError);
        }
      }
    }
    setEnteringApp(true);
  }

  if (backendDown && backendHealth) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-stone-50 px-6 text-center">
        <h1 className="text-xl font-bold text-stone-900">השרת לא זמין כרגע</h1>
        <p className="max-w-md text-sm leading-relaxed text-stone-600">
          {convexHealthMessage(backendHealth)}
        </p>
        {backendHealth.reason === "plan_disabled" ? (
          <a
            className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600"
            href="https://dashboard.convex.dev/t/erezbabayan/babitk/settings/billing"
            target="_blank"
            rel="noreferrer"
          >
            שדרוג Convex Pro
          </a>
        ) : null}
        <button
          type="button"
          className="text-sm font-semibold text-sky-800 underline"
          onClick={() => window.location.reload()}
        >
          נסה שוב
        </button>
      </div>
    );
  }

  if (!inApp) {
    return (
      <LoginScreen
        mode="auth"
        subtitle={
          authTimedOut
            ? "השרת לא הגיב — בדקו חיבור או שדרוג Convex, ואז התחברו שוב"
            : "התחבר או הירשם לחשבון שלך"
        }
        showEmailForm
        allowSignup
        signupAutoSignIn
        onSubmit={handleAuth}
        showRememberMe
      />
    );
  }

  if (!userId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-stone-50 text-stone-600">
        טוען את החשבון...
      </div>
    );
  }

  return (
    <UserTagsProvider userId={userId}>
    <AppShell
      userName={headerUserName}
      userId={userId}
      onLogoClick={goHome}
      onSettings={() => setSettingsOpen(true)}
      onLogout={() => {
        clearAuthSessionCaches();
        void signOut();
      }}
      onCaptured={() => setCaptureTick((t) => t + 1)}
      beforeMain={
        <>
          {settingsOpen ? (
            <SettingsPanel
              userId={userId}
              summary={summary}
              onOpenPaywall={() => {
                setPaywallCode(null);
                setPaywallOpen(true);
              }}
              onClose={() => setSettingsOpen(false)}
            />
          ) : null}
          {billingNotice ? (
            <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-sm text-emerald-800">
              {billingNotice}
            </div>
          ) : null}
          {profileMissing ? (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
              לא הצלחנו לטעון את הפרופיל.{" "}
              <button
                type="button"
                onClick={() => {
                  clearAuthSessionCaches();
                  void signOut();
                }}
                className="font-semibold underline"
              >
                התנתק ונסה שוב
              </button>
            </div>
          ) : null}
        </>
      }
    >
      <ErrorBoundary>
        <Dashboard
          userId={userId}
          refreshTick={captureTick}
          homeResetTick={homeResetTick}
        />
      </ErrorBoundary>

      <PaywallModal
        open={paywallOpen}
        code={paywallCode}
        summary={summary}
        onClose={() => setPaywallOpen(false)}
        onUpgraded={() => void refreshUsage()}
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
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallCode, setPaywallCode] = useState<"audio_quota" | "ai_parse_quota" | null>(null);
  const { summary, refresh: refreshUsage } = useUsage(Boolean(userId));
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [captureTick, setCaptureTick] = useState(0);
  const [homeResetTick, setHomeResetTick] = useState(0);
  const headerUserName = useHeaderUserName({ userId, userMetadata });

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
    } else if (billing === "cancel") {
      setBillingNotice("התשלום בוטל.");
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      void supabase.auth
        .exchangeCodeForSession(code)
        .then(() => {
          window.history.replaceState({}, "", window.location.pathname);
        })
        .catch((error) => {
          console.warn(
            "[auth] exchangeCodeForSession failed:",
            error instanceof Error ? error.message : String(error),
          );
          window.history.replaceState({}, "", window.location.pathname);
        });
    }

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        setUserId(data.session?.user.id ?? null);
        setUserMetadata(data.session?.user.user_metadata ?? null);
      })
      .catch((error) => {
        console.warn(
          "[auth] getSession failed:",
          error instanceof Error ? error.message : String(error),
        );
        setUserId(null);
        setUserMetadata(null);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setUserMetadata(session?.user.user_metadata ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  async function handleAuth(
    email: string,
    password: string,
    authMode: "login" | "signup",
    rememberMe = true,
    signupDetails?: { firstName: string; lastName: string; phone: string },
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    applyRememberMePreference(rememberMe, normalizedEmail);
    if (authMode === "login") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (signInError) throw signInError;
      persistLoginDetails(rememberMe, normalizedEmail);
      return;
    }

    if (!signupDetails) {
      throw new Error("יש להזין שם, שם משפחה וטלפון");
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: signupDetails.firstName,
          last_name: signupDetails.lastName,
          phone: signupDetails.phone,
          full_name: [signupDetails.firstName, signupDetails.lastName]
            .filter(Boolean)
            .join(" "),
        },
      },
    });
    if (signUpError) throw signUpError;

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

  async function handleMicrosoftSignIn() {
    await signInWithMicrosoft(supabase);
  }

  if (!userId) {
    return (
      <LoginScreen
        mode="auth"
        onSubmit={handleAuth}
        onMicrosoftSignIn={handleMicrosoftSignIn}
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
              onOpenPaywall={() => {
                setPaywallCode(null);
                setPaywallOpen(true);
              }}
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
        onUpgraded={() => void refreshUsage()}
      />
    </AppShell>
    </UserTagsProvider>
  );
}
