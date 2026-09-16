import { isConvexConfigured } from "./convex";
import { isSyncEnabled } from "./sync-client";
import { isDemoMode, isSupabaseConfigured } from "./supabase";

/** Explicit demo flag only — missing Supabase does not force demo. */
export function isExplicitDemoMode(): boolean {
  return import.meta.env.VITE_DEMO_MODE === "true";
}

/** Google / Microsoft login via Convex Auth when Supabase is not configured.
 * Demo / local fallback uses a legacy UUID and must not activate this path. */
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
