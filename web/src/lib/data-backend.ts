import { isDemoMode } from "./supabase";
import { isConvexConfigured } from "./convex";

/** Board items: demo uses sync store; otherwise Convex when configured. */
export function useConvexBackend(): boolean {
  if (import.meta.env.VITE_USE_CONVEX === "false") return false;
  if (isDemoMode) return false;
  return isConvexConfigured;
}

/** Task lists & user bridge — never hit Convex in offline demo. */
export function useConvexFeatures(): boolean {
  if (import.meta.env.VITE_USE_CONVEX === "false") return false;
  if (isDemoMode) return false;
  return isConvexConfigured;
}
