import { isDemoMode, isSupabaseConfigured } from "./supabase";
import { isSyncEnabled } from "./sync-client";

/** Convex Auth is retired. The app authenticates with Supabase only. */
export function shouldUseConvexAuthLogin(): boolean {
  return false;
}

/** Persist user tag definitions locally (offline demo without sync only). */
export function usesLocalUserTags(): boolean {
  return isDemoMode && !isSyncEnabled() && !isSupabaseConfigured;
}

/** Tag definitions live in Supabase `user_tags`. */
export function usesConvexUserTags(): boolean {
  return false;
}
