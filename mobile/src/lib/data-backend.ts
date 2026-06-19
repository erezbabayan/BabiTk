import { isConvexConfigured } from "./convex";
import { isDemoMode } from "./supabase";

export function useConvexBackend(): boolean {
  if (isDemoMode) return false;
  if (process.env.EXPO_PUBLIC_USE_CONVEX === "false") return false;
  return isConvexConfigured;
}
