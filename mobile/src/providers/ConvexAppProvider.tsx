import type { ReactNode } from "react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexProvider } from "convex/react";

import { convex, isConvexConfigured } from "../lib/convex";
import { mutableAuthTokenStorage } from "../lib/auth-storage";
import { shouldUseConvexAuthLogin } from "../lib/auth-mode";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL?.trim() ?? "";

export function ConvexAppProvider({ children }: { children: ReactNode }) {
  if (!isConvexConfigured || !convex) {
    return children;
  }

  if (shouldUseConvexAuthLogin()) {
    return (
      <ConvexAuthProvider
        client={convex}
        storage={mutableAuthTokenStorage}
        storageNamespace={convexUrl || undefined}
        shouldHandleCode={false}
        replaceURL={() => {
          /* React Native has no browser URL bar */
        }}
      >
        {children}
      </ConvexAuthProvider>
    );
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
