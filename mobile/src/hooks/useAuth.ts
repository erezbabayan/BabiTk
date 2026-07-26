import { useEffect, useState } from "react";

import type { Session } from "@supabase/supabase-js";

import {

  DEMO_LOGIN_EMAIL,

  DEMO_LOGIN_PASSWORD,

  DEMO_USER_ID,

  enterDemoSession,

  exitDemoSession,

  isDemoSessionActive,

} from "../lib/demo-store";

import { isSupabaseConfigured, requireSupabase } from "../lib/supabase";
import { shouldUseConvexAuthLogin } from "../lib/auth-mode";
import { applyRememberMePreference } from "../lib/auth-storage";
import { clearAllConvexUserCaches } from "../lib/convex-user-cache";



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



function assertLocalDemoCredentials(email: string, password: string): void {

  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {

    throw new Error("יש להזין אימייל");

  }

  if (!password) {

    throw new Error("יש להזין סיסמה");

  }

  if (

    normalizedEmail !== DEMO_LOGIN_EMAIL ||

    password !== DEMO_LOGIN_PASSWORD

  ) {

    throw new Error("אימייל או סיסמה שגויים");

  }

}



async function enterLocalDemoSession(): Promise<Session> {

  await enterDemoSession();

  return demoSession;

}



export function useAuth() {

  const [session, setSession] = useState<Session | null>(null);

  const [loading, setLoading] = useState(true);



  useEffect(() => {

    if (!isSupabaseConfigured) {
      if (shouldUseConvexAuthLogin()) {
        setSession(null);
        setLoading(false);
        return;
      }

      void isDemoSessionActive()
        .then((active) => {
          setSession(active ? demoSession : null);
          setLoading(false);
        })
        .catch(() => {
          setSession(null);
          setLoading(false);
        });

      return;

    }



    const supabase = requireSupabase();

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        setSession(null);
        setLoading(false);
      });


    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {

      setSession(next);

    });



    return () => listener.subscription.unsubscribe();

  }, []);



  const signIn = async (email: string, password: string, rememberMe = true) => {
    await applyRememberMePreference(rememberMe, email);

    if (!isSupabaseConfigured) {
      if (shouldUseConvexAuthLogin()) {
        throw new Error("התחברות דורשת Convex Auth");
      }

      assertLocalDemoCredentials(email, password);

      setSession(await enterLocalDemoSession());

      return;

    }



    const supabase = requireSupabase();

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) throw error;

  };



  const signUp = async (
    email: string,
    password: string,
    details: { firstName: string; lastName: string; phone: string },
  ) => {

    if (!isSupabaseConfigured) {

      throw new Error("הרשמה דורשת חיבור ל-Supabase");

    }



    const supabase = requireSupabase();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: details.firstName,
          last_name: details.lastName,
          phone: details.phone,
          full_name: [details.firstName, details.lastName].filter(Boolean).join(" "),
        },
      },
    });

    if (error) throw error;

  };



  const signInWithGoogleAccount = async () => {

    if (!isSupabaseConfigured) {

      throw new Error("התחברות Google דורשת Supabase — הרץ setup-supabase.ps1");

    }



    const supabase = requireSupabase();

    const { signInWithGoogle } = await import("../lib/google-auth");
    await signInWithGoogle(supabase);

  };



  const signInWithMicrosoftAccount = async () => {

    if (!isSupabaseConfigured) {

      throw new Error("התחברות Microsoft דורשת Supabase — הרץ setup-supabase.ps1");

    }



    const supabase = requireSupabase();

    const { signInWithMicrosoft } = await import("../lib/microsoft-auth");
    await signInWithMicrosoft(supabase);

  };



  const signInDemoQuick = async () => {

    setSession(await enterLocalDemoSession());

  };



  const signOut = async () => {
    await clearAllConvexUserCaches();

    if (!isSupabaseConfigured) {

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

    signInWithGoogle: signInWithGoogleAccount,

    signInWithMicrosoft: signInWithMicrosoftAccount,

    signInDemoQuick,

    signOut,

  };

}



