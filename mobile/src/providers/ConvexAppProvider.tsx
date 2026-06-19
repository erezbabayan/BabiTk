import type { ReactNode } from "react";
import { ConvexProvider } from "convex/react";

import { convex, isConvexConfigured } from "../lib/convex";

export function ConvexAppProvider({ children }: { children: ReactNode }) {
  if (!isConvexConfigured || !convex) {
    return children;
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
