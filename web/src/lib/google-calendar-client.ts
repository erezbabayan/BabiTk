import { currentAccessToken } from "./whatsapp-gateway";
import { isDemoMode, isSupabaseConfigured } from "./supabase";
import { isCalendarRelevantPatch } from "./google-calendar-patch";

const TIMEOUT_MS = 12_000;

export { isCalendarRelevantPatch };

function calendarFunctionUrl(action?: string): string {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  const path = action ? `google-calendar/${action}` : "google-calendar";
  return `${supabaseUrl}/functions/v1/${path}`;
}

async function invokeCalendar<T>(
  action: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {},
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
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await response.json().catch(() => null)) as T | { message?: string; error?: string } | null;
  if (!response.ok) {
    const record = data && typeof data === "object" ? data : null;
    const message =
      (record && "message" in record && typeof record.message === "string" && record.message) ||
      (record && "error" in record && typeof record.error === "string" && record.error) ||
      "calendar_request_failed";
    throw new Error(message);
  }
  return data as T;
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
}> {
  return invokeCalendar<{ linked: boolean; configured: boolean }>("status");
}

export async function disconnectGoogleCalendarFromEdge(): Promise<void> {
  await invokeCalendar("disconnect", { method: "POST", body: {} });
}

export function queueGoogleCalendarItemSync(itemId: string, patch?: Record<string, unknown>): void {
  if (!itemId || isDemoMode || !isSupabaseConfigured) return;
  if (patch && !isCalendarRelevantPatch(patch)) return;
  void invokeCalendar("sync", { method: "POST", body: { itemId } }).catch((error) => {
    console.error("google calendar sync failed", error);
  });
}
