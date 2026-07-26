import { isConvexConfigured } from "./convex";
import { shouldUseConvexAuthLogin } from "./auth-mode";
import { isDemoMode } from "./supabase";
import { isSyncEnabled } from "./sync-client";

/** Demo writes go through sync store; reads can use Convex when web mirrors sync → Convex. */
export function useConvexItemsRead(): boolean {
  if (process.env.EXPO_PUBLIC_USE_CONVEX === "false") return false;
  return isConvexConfigured;
}

/** Board items: demo uses sync store for writes; production uses Convex when configured. */
export function useConvexBackend(): boolean {
  if (process.env.EXPO_PUBLIC_USE_CONVEX === "false") return false;
  if (!isConvexConfigured) return false;
  return true;
}

/** Demo + sync: poll sync server for writes; Convex reactive read when configured. */
export function useDemoHybridSync(): boolean {
  return (
    isDemoMode &&
    !shouldUseConvexAuthLogin() &&
    isSyncEnabled() &&
    useConvexItemsRead()
  );
}

/** Task lists & user bridge — available in demo when Convex URL is set. */
export function useConvexFeatures(): boolean {
  if (process.env.EXPO_PUBLIC_USE_CONVEX === "false") return false;
  return isConvexConfigured;
}
