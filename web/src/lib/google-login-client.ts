import { requireSupabase } from "./supabase";
import {
  looksLikeGoogleClientId,
  looksLikeGoogleClientSecret,
} from "./google-calendar-setup";

const TIMEOUT_MS = 20_000;

function functionUrl(action?: string): string {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  const path = action ? `google-login/${action}` : "google-login";
  return `${supabaseUrl}/functions/v1/${path}`;
}

type SessionBody = {
  access_token?: unknown;
  refresh_token?: unknown;
  message?: unknown;
  error?: unknown;
  googleClientId?: unknown;
  configured?: unknown;
};

function readMessage(data: SessionBody | null, fallback: string): string {
  if (data && typeof data.message === "string" && data.message.trim()) {
    return data.message.trim();
  }
  if (data && typeof data.error === "string" && data.error.trim()) {
    return data.error.trim();
  }
  return fallback;
}

async function applySession(data: SessionBody): Promise<void> {
  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  const refreshToken = typeof data.refresh_token === "string" ? data.refresh_token : "";
  if (!accessToken || !refreshToken) {
    throw new Error("לא התקבלה הרשאת כניסה מ-Google.");
  }
  const { error } = await requireSupabase().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
}

async function postGoogleLogin(
  action: string | undefined,
  body: Record<string, unknown>,
): Promise<SessionBody> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!supabaseUrl) {
    throw new Error("Supabase is not configured");
  }
  const response = await fetch(functionUrl(action), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await response.json().catch(() => null)) as SessionBody | null;
  if (!response.ok || !data) {
    throw new Error(readMessage(data, "התחברות Google נכשלה. נסו שוב."));
  }
  return data;
}

export async function completeGoogleLoginWithCode(code: string): Promise<void> {
  const data = await postGoogleLogin(undefined, { code });
  await applySession(data);
}

export async function completeGoogleLoginWithIdToken(idToken: string): Promise<void> {
  const data = await postGoogleLogin(undefined, { idToken });
  await applySession(data);
}

export async function activateGoogleLogin(input: {
  email: string;
  password: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ googleClientId: string }> {
  const email = input.email.trim().toLowerCase();
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!looksLikeGoogleClientId(clientId) || !looksLikeGoogleClientSecret(clientSecret)) {
    throw new Error(
      "Client ID או Secret לא תקינים. הדביקו את הערכים מלקוח Web application ב-Google Cloud.",
    );
  }
  const data = await postGoogleLogin("activate", {
    email,
    password: input.password,
    clientId,
    clientSecret,
  });
  await applySession(data);
  const googleClientId =
    typeof data.googleClientId === "string" && looksLikeGoogleClientId(data.googleClientId)
      ? data.googleClientId
      : clientId;
  return { googleClientId };
}
