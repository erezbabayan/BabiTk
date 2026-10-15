import { currentAccessToken } from "./whatsapp-gateway";
import { isDemoMode, isSupabaseConfigured, requireSupabase, supabaseAuthRedirectUrl } from "./supabase";
import { isCalendarRelevantPatch } from "./google-calendar-patch";
import {
  GOOGLE_CALENDAR_SCOPE,
  formatCalendarConnectError,
  googleCalendarIdentityOptions,
  sessionHasGoogleIdentity,
} from "./google-calendar-connect";
import {
  googleCalendarHealthFromUnknown,
  googleOAuthSetupPublic,
  type GoogleCalendarHealth,
} from "./google-calendar-setup";

const TIMEOUT_MS = 12_000;
const SYNC_ALL_TIMEOUT_MS = 25_000;
export const CALENDAR_LINK_FLAG = "babitk-calendar-link";
export { GOOGLE_CALENDAR_SCOPE };

export { isCalendarRelevantPatch };

function calendarFunctionUrl(action?: string): string {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  const path = action ? `google-calendar/${action}` : "google-calendar";
  return `${supabaseUrl}/functions/v1/${path}`;
}

async function invokeCalendar<T>(
  action: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown>; timeoutMs?: number } = {},
): Promise<T> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!supabaseUrl) {
    throw new Error("Supabase is not configured");
  }
  const token = await currentAccessToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  const response = await fetch(calendarFunctionUrl(action), {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey || token,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
  });
  const data = (await response.json().catch(() => null)) as T | { message?: string; error?: string } | null;
  if (!response.ok) {
    const record = data && typeof data === "object" ? data : null;
    const code =
      record && "error" in record && typeof record.error === "string" ? record.error : "";
    const message =
      (record && "message" in record && typeof record.message === "string" && record.message) ||
      code ||
      "calendar_request_failed";
    const error = new Error(message);
    error.name = code || "CalendarRequestError";
    throw error;
  }
  return data as T;
}

export function isGoogleCalendarNotConfiguredError(error: unknown): boolean {
  const err = error instanceof Error ? error : null;
  const message = err?.message ?? String(error);
  const name = err?.name ?? "";
  return (
    name === "google_not_configured" ||
    message === "google_not_configured" ||
    message.includes("עדיין לא הוגדר")
  );
}

export async function getGoogleCalendarConnectUrlFromEdge(): Promise<string> {
  const data = await invokeCalendar<{ url: string }>("connect");
  if (!data.url) {
    throw new Error("לא התקבלה כתובת חיבור ליומן");
  }
  return data.url;
}

export async function getGoogleCalendarStatusFromEdge(): Promise<{
  linked: boolean;
  configured: boolean;
  canConfigure?: boolean;
}> {
  return invokeCalendar<{ linked: boolean; configured: boolean; canConfigure?: boolean }>(
    "status",
  );
}

export async function configureGoogleOAuthFromEdge(
  clientId: string,
  clientSecret: string,
): Promise<{ configured: boolean; authProviderEnabled: boolean }> {
  const data = await invokeCalendar<{
    configured?: boolean;
    authProviderEnabled?: boolean;
  }>("configure", {
    method: "POST",
    body: { clientId, clientSecret },
  });
  return {
    configured: data.configured === true,
    authProviderEnabled: data.authProviderEnabled === true,
  };
}

export async function getGoogleCalendarHealth(): Promise<GoogleCalendarHealth> {
  const fallback = googleCalendarHealthFromUnknown({});
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!supabaseUrl) return fallback;
  try {
    const response = await fetch(calendarFunctionUrl("health"), {
      headers: {
        ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) return fallback;
    return googleCalendarHealthFromUnknown(data, supabaseUrl);
  } catch {
    return googleCalendarHealthFromUnknown(googleOAuthSetupPublic(supabaseUrl), supabaseUrl);
  }
}

export async function disconnectGoogleCalendarFromEdge(): Promise<void> {
  await invokeCalendar("disconnect", { method: "POST", body: {} });
}

export async function linkGoogleCalendarFromEdge(refreshToken?: string | null): Promise<void> {
  await invokeCalendar("link", {
    method: "POST",
    body: refreshToken ? { refreshToken } : {},
  });
}

async function currentProviderTokens(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
}> {
  const { data } = await requireSupabase().auth.getSession();
  const session = data.session;
  return {
    accessToken: typeof session?.provider_token === "string" ? session.provider_token : null,
    refreshToken:
      typeof session?.provider_refresh_token === "string" ? session.provider_refresh_token : null,
  };
}

function hebrewGoogleAuthError(error: unknown): Error {
  return new Error(formatCalendarConnectError(error));
}

export async function startGoogleCalendarIdentityLink(): Promise<void> {
  sessionStorage.setItem(CALENDAR_LINK_FLAG, "1");
  const supabase = requireSupabase();
  const spec = googleCalendarIdentityOptions(`${supabaseAuthRedirectUrl()}?calendar=connected`);
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const hasGoogle = sessionHasGoogleIdentity(sessionData.session?.user?.identities);
    if (hasGoogle) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: spec.provider,
        options: {
          ...spec.options,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw hebrewGoogleAuthError(error);
      if (!data.url) throw hebrewGoogleAuthError("No OAuth URL returned");
      window.location.assign(data.url);
      return;
    }
    const { error } = await supabase.auth.linkIdentity({
      provider: spec.provider,
      options: spec.options,
    });
    if (error) throw hebrewGoogleAuthError(error);
  } catch (error) {
    sessionStorage.removeItem(CALENDAR_LINK_FLAG);
    throw hebrewGoogleAuthError(error);
  }
}

export async function startGoogleCalendarConnect(): Promise<void> {
  if (isDemoMode) return;
  const data = await invokeCalendar<{ url?: string }>("subscribe", {
    method: "POST",
    body: {},
  });
  if (!data.url) {
    throw hebrewGoogleAuthError("לא התקבלה כתובת חיבור ליומן");
  }
  window.open(data.url, "_blank", "noopener,noreferrer");
}

export async function persistGoogleCalendarSessionLink(force = false): Promise<boolean> {
  if (isDemoMode || !isSupabaseConfigured) return false;
  const pending = sessionStorage.getItem(CALENDAR_LINK_FLAG) === "1";
  const params = new URLSearchParams(window.location.search);
  const fromRedirect = params.get("calendar") === "connected";
  if (!force && !pending && !fromRedirect) return false;

  const { data } = await requireSupabase().auth.getSession();
  if (!data.session) return false;

  const tokens = await currentProviderTokens();
  await linkGoogleCalendarFromEdge(tokens.refreshToken);
  sessionStorage.removeItem(CALENDAR_LINK_FLAG);
  if (tokens.accessToken) {
    void invokeCalendar("sync-all", {
      method: "POST",
      timeoutMs: SYNC_ALL_TIMEOUT_MS,
      body: { syncAll: true, accessToken: tokens.accessToken },
    }).catch((error) => {
      console.error("google calendar sync-all failed", error);
    });
  }
  return true;
}

export function queueGoogleCalendarItemSync(itemId: string, patch?: Record<string, unknown>): void {
  if (!itemId || isDemoMode || !isSupabaseConfigured) return;
  if (patch && !isCalendarRelevantPatch(patch)) return;
  void (async () => {
    const tokens = await currentProviderTokens();
    await invokeCalendar("sync", {
      method: "POST",
      body: {
        itemId,
        ...(tokens.accessToken ? { accessToken: tokens.accessToken } : {}),
      },
    });
  })().catch((error) => {
    console.error("google calendar sync failed", error);
  });
}
