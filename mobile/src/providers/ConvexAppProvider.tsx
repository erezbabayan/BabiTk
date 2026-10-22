import { useState, type ReactNode } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";

/**
 * Supabase owns the session. Convex hooks (useConvexAuth, useQuery, useMutation)
 * still require this provider, or the first screen after login throws.
 * When no deployment URL is baked in, the client is never authenticated and
 * callers skip subscriptions, so nothing dials a retired Convex backend.
 */
const convexUrl =
  process.env.EXPO_PUBLIC_CONVEX_URL?.trim() || "https://unused.convex.cloud";

const convexClient = new ConvexReactClient(convexUrl, {
  unsavedChangesWarning: false,
  verbose: false,
  logger: false,
});

function useNativeConvexAuth() {
  const [state] = useState(() => ({
    isLoading: false,
    isAuthenticated: false,
    fetchAccessToken: async (_args: { forceRefreshToken: boolean }) => null as string | null,
  }));
  return state;
}

export function ConvexAppProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convexClient} useAuth={useNativeConvexAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
