import { useConvexAuth as useConvexAuthFromConvex } from "convex/react";
import { useConvexAuth as useConvexAuthFromAuth } from "@convex-dev/auth/react";

import { CONVEX_RUNTIME } from "../lib/convex-runtime";

const OFFLINE = !CONVEX_RUNTIME;

function useOfflineAuthOffline(): {
  isLoading: boolean;
  isAuthenticated: boolean;
} {
  return { isLoading: false, isAuthenticated: false };
}

/**
 * useConvexAuth that is safe in offline/demo builds (no Convex provider).
 * Hook identity is fixed at module load from build-time env flags.
 */
export const useSafeConvexAuth: () => {
  isLoading: boolean;
  isAuthenticated: boolean;
} = OFFLINE ? useOfflineAuthOffline : useConvexAuthFromConvex;

export const useSafeConvexAuthFromAuth: () => {
  isLoading: boolean;
  isAuthenticated: boolean;
} = OFFLINE ? useOfflineAuthOffline : useConvexAuthFromAuth;
