import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  enterDemoSession,
  exitDemoSession,
  isDemoSessionActive,
  DEMO_USER_ID,
} from "../lib/demo-store";
import { isDemoMode, requireSupabase } from "../lib/supabase";

const demoSession: Session = {
  access_token: "demo",
  refresh_token: "demo",
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id: DEMO_USER_ID,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  },
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemoMode) {
      void isDemoSessionActive().then((active) => {
        setSession(active ? demoSession : null);
        setLoading(false);
      });
      return;
    }

    const supabase = requireSupabase();
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (isDemoMode) {
      await enterDemoSession();
      setSession(demoSession);
      return;
    }

    const supabase = requireSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    if (isDemoMode) {
      await enterDemoSession();
      setSession(demoSession);
      return;
    }

    const supabase = requireSupabase();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    if (isDemoMode) {
      await exitDemoSession();
      setSession(null);
      return;
    }

    const supabase = requireSupabase();
    await supabase.auth.signOut();
  };

  return {
    session,
    userId: session?.user.id ?? null,
    loading,
    signIn,
    signUp,
    signOut,
  };
}
