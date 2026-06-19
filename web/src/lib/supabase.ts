import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

export const isDemoMode =
  import.meta.env.VITE_DEMO_MODE === "true" || !isSupabaseConfigured;

let client: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  client = createClient(supabaseUrl, supabaseAnonKey);
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
