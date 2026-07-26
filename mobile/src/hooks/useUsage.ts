import { useCallback, useEffect, useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { getUsageSummary, type UsageSummary } from "../lib/api";
import { useConvexBackend } from "../lib/data-backend";
import { isDemoMode } from "../lib/supabase";

function mapConvexUsage(
  row: {
    tier: "free" | "premium";
    isPremium: boolean;
    periodStart: string;
    audio: { used: number; allocated: number; remaining: number };
    aiParses: { used: number; allocated: number; remaining: number };
  } | null | undefined,
): UsageSummary | null {
  if (!row) return null;
  return {
    tier: row.tier === "premium" ? "premium" : "free",
    isPremium: row.isPremium,
    periodStart: row.periodStart,
    audio: row.audio,
    aiParses: row.aiParses,
  };
}

export function useUsage(enabled: boolean) {
  const convexBackend = useConvexBackend();
  const { isAuthenticated } = useConvexAuth();
  const convexEnabled = enabled && convexBackend && isAuthenticated && !isDemoMode;
  const convexRow = useQuery(api.users.usageSummary, convexEnabled ? {} : "skip");

  const [summary, setSummary] = useState<UsageSummary | null>(null);

  useEffect(() => {
    if (!convexEnabled) return;
    setSummary(mapConvexUsage(convexRow));
  }, [convexEnabled, convexRow]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (convexBackend && !isDemoMode) return;
    try {
      const data = await getUsageSummary();
      setSummary(data);
    } catch {
      setSummary(null);
    }
  }, [enabled, convexBackend]);

  useEffect(() => {
    if (convexEnabled) return;
    void refresh();
  }, [convexEnabled, refresh]);

  return { summary, refresh };
}
