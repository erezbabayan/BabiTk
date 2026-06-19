import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

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
  process.env.EXPO_PUBLIC_DEMO_MODE === "true" || !isSupabaseConfigured;

let client: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

export const supabase = client as SupabaseClient;

export function requireSupabase(): SupabaseClient {
  if (!client) {
    throw new Error("Supabase is not configured");
  }
  return client;
}

export interface OcrLine {
  text: string;
  completed: boolean;
  bbox: { left: number; top: number; width: number; height: number };
}

export interface MindtaskerItem {
  id: string;
  title: string;
  content: string;
  is_actionable: boolean;
  status: "inbox" | "pending" | "completed" | "snoozed_archive";
  due_date: string | null;
  tags: string[];
  sort_order?: number;
  created_at?: string;
  metadata?: Record<string, unknown> | null;
  source_material_id?: string | null;
  last_interacted_at?: string | null;
  completed_at?: string | null;
  deleted_at?: string | null;
  source_materials?: {
    id: string;
    source_type: string;
    storage_url: string | null;
    raw_text: string | null;
    metadata?: { ocr_lines?: OcrLine[] } | null;
  } | null;
}

/** Supabase joins may return source_materials as object or single-element array */
export function normalizeMindtaskerRows(rows: unknown[] | null): MindtaskerItem[] {
  return (rows ?? []).map((row) => {
    const item = row as MindtaskerItem & { source_materials?: unknown };
    const sm = item.source_materials;
    const source_materials = Array.isArray(sm)
      ? ((sm[0] as MindtaskerItem["source_materials"]) ?? null)
      : (sm as MindtaskerItem["source_materials"]) ?? null;
    return { ...item, source_materials };
  });
}
