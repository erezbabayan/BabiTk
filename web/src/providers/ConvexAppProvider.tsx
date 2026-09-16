import type { ReactNode } from "react";

/** Convex was removed. The provider is a no-op so leftover imports still compile. */
export function ConvexAppProvider({ children }: { children: ReactNode }) {
  return children;
}
