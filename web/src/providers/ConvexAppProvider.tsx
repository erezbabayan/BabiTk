import type { ReactNode } from "react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexProvider } from "convex/react";

import { convex, isConvexConfigured } from "../lib/convex";
import { mutableAuthTokenStorage } from "../lib/auth-storage";
import { isDemoMode } from "../lib/supabase";

export function ConvexAppProvider({ children }: { children: ReactNode }) {
  // Offline / demo: never open a Convex websocket (cloud may be disabled).
  if (isDemoMode || import.meta.env.VITE_USE_CONVEX === "false" || !isConvexConfigured || !convex) {
    return children;
  }

  return (
    <ConvexAuthProvider
      client={convex}
      storage={mutableAuthTokenStorage}
      replaceURL={(relativeUrl) => {
        window.history.replaceState({}, "", relativeUrl);
      }}
    >
      {children}
    </ConvexAuthProvider>
  );
}
