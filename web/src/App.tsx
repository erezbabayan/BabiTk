import { useEffect, useState } from "react";

import { AppHeader } from "./components/AppHeader";
import { Dashboard } from "./components/Dashboard";
import { LoginScreen } from "./components/LoginScreen";
import { PaywallModal } from "./components/PaywallModal";
import { QuickCapture } from "./components/QuickCapture";
import { SettingsPanel } from "./components/SettingsPanel";
import { useUsage } from "./hooks/useUsage";
import { registerPaywallHandler } from "./lib/api";
import { DEMO_USER_ID } from "./lib/demo-store";
import { resyncAllItemsToConvex } from "./lib/convex-mirror";
import { isSyncEnabled } from "./lib/sync-client";
import { isDemoMode, isSupabaseConfigured, requireSupabase } from "./lib/supabase";

export default function App() {
  if (isDemoMode) {
    return <DemoApp />;
  }

  if (!isSupabaseConfigured) {
    return <LoginScreen mode="setup" />;
  }

  return <ConfiguredApp />;
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
    if (!userId) return;
    void resyncAllItemsToConvex();
  }, [userId]);

  useEffect(() => {
    registerPaywallHandler((code) => {
      setPaywallCode(code);
      setPaywallOpen(true);
      void refreshUsage();
    });
    return () => registerPaywallHandler(null);
  }, [refreshUsage]);

  function enterDemo() {
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
    <div>
      <AppHeader
        center={<QuickCapture onCaptured={() => setCaptureTick((t) => t + 1)} />}
      >
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="border border-slate-300 hover:bg-slate-50"
        >
          הגדרות
        </button>
        <button
          type="button"
          onClick={exitDemo}
          className="border border-slate-300 hover:bg-slate-50"
        >
          התנתק
        </button>
      </AppHeader>

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

      <Dashboard userId={userId} refreshTick={captureTick} />

      <PaywallModal
        open={paywallOpen}
        code={paywallCode}
        summary={summary}
        onClose={() => setPaywallOpen(false)}
        onUpgraded={() => void refreshUsage()}
      />
    </div>
  );
}

function ConfiguredApp() {
  const supabase = requireSupabase();
  const [userId, setUserId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallCode, setPaywallCode] = useState<"audio_quota" | "ai_parse_quota" | null>(null);
  const { summary, refresh: refreshUsage } = useUsage(Boolean(userId));
  const [billingNotice, setBillingNotice] = useState<string | null>(null);
  const [captureTick, setCaptureTick] = useState(0);

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
    void supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  async function handleAuth(email: string, password: string, authMode: "login" | "signup") {
    if (authMode === "login") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) throw signUpError;
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (!userId) {
    return <LoginScreen mode="auth" onSubmit={handleAuth} />;
  }

  return (
    <div>
      <AppHeader
        center={<QuickCapture onCaptured={() => setCaptureTick((t) => t + 1)} />}
      >
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="border border-slate-300 hover:bg-slate-50"
        >
          הגדרות
        </button>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="border border-slate-300 hover:bg-slate-50"
        >
          התנתק
        </button>
      </AppHeader>

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

      <Dashboard userId={userId} refreshTick={captureTick} />

      <PaywallModal
        open={paywallOpen}
        code={paywallCode}
        summary={summary}
        onClose={() => setPaywallOpen(false)}
        onUpgraded={() => void refreshUsage()}
      />
    </div>
  );
}
