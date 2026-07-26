import { isConvexConfigured } from "./convex";
import { isSyncEnabled } from "./sync-client";
import { isDemoMode, isSupabaseConfigured } from "./supabase";

/** Google / password login via Convex Auth when Supabase is not configured.
 * Explicit demo mode must not activate this path — Demo uses a legacy UUID. */
export function shouldUseConvexAuthLogin(): boolean {
  return !isDemoMode && !isSupabaseConfigured && isConvexConfigured;
}

/** Persist user tag definitions locally (offline demo without sync only). */
export function usesLocalUserTags(): boolean {
  return isDemoMode && !isSyncEnabled() && !shouldUseConvexAuthLogin();
}

/** Tag definitions live in Convex `userTagDefinitions`. */
export function usesConvexUserTags(): boolean {
  return shouldUseConvexAuthLogin();
}
