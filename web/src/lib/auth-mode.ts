import { isDemoMode, isSupabaseConfigured } from "./supabase";

export function isExplicitDemoMode(): boolean {
  return import.meta.env.VITE_DEMO_MODE === "true";
}

/** Convex Auth is retired. The web app authenticates with Supabase only. */
export function shouldUseConvexAuthLogin(): boolean {
  return false;
}

export function usesLocalUserTags(): boolean {
  return isDemoMode && !isSupabaseConfigured;
}

export function usesConvexUserTags(): boolean {
  return false;
}
