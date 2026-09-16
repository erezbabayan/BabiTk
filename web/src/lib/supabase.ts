import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAuthStorage } from "./auth-storage";
import { readForcedLocalMode, writeForcedLocalMode } from "./runtime-mode";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

function isValidSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const isSupabaseConfigured =
  supabaseUrl.length > 0 &&
  supabaseAnonKey.length > 0 &&
  isValidSupabaseUrl(supabaseUrl) &&
  !supabaseUrl.includes("[project-ref]");

/** Offline demo only when Supabase is not the live multi-user backend. */
export let isDemoMode =
  !isSupabaseConfigured &&
  (import.meta.env.VITE_DEMO_MODE === "true" || readForcedLocalMode());

export function isForcedLocalMode(): boolean {
  return !isSupabaseConfigured && readForcedLocalMode();
}

export function enableForcedLocalMode(): void {
  if (isSupabaseConfigured) return;
  writeForcedLocalMode(true);
  isDemoMode = true;
}

export function clearForcedLocalMode(): void {
  writeForcedLocalMode(false);
  isDemoMode =
    !isSupabaseConfigured && import.meta.env.VITE_DEMO_MODE === "true";
}

export function supabaseAuthRedirectUrl(): string {
  if (typeof window === "undefined") return "";
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

export function retryCloudBackend(): void {
  clearForcedLocalMode();
  window.location.reload();
}

let client: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      detectSessionInUrl: true,
      flowType: "pkce",
      storage: getSupabaseAuthStorage() as unknown as Storage,
      persistSession: true,
    },
  });
} else if (import.meta.env.DEV) {
  console.warn(
    "Missing or invalid VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in web/.env",
  );
}

export const supabase = client as SupabaseClient;

export function requireSupabase(): SupabaseClient {
  if (!client) {
    throw new Error("Supabase is not configured");
  }
  return client;
}
