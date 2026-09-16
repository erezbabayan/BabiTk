import { isDemoMode, isSupabaseConfigured } from "./supabase";
import { isConvexConfigured } from "./convex";

/** Board items: Convex only when Supabase is not the live multi-user backend. */
export function useConvexBackend(): boolean {
  if (import.meta.env.VITE_USE_CONVEX === "false") return false;
  if (isDemoMode) return false;
  if (isSupabaseConfigured) return false;
  return isConvexConfigured;
}

/** Task lists & user bridge — never hit Convex in offline demo or on Supabase. */
export function useConvexFeatures(): boolean {
  if (import.meta.env.VITE_USE_CONVEX === "false") return false;
  if (isDemoMode) return false;
  if (isSupabaseConfigured) return false;
  return isConvexConfigured;
}
