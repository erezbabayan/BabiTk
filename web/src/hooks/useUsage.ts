import { useCallback, useEffect, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { getUsageSummaryApi, type UsageSummary } from "../lib/api";
import { useConvexBackend } from "../lib/data-backend";
import { useSafeConvexAuth } from "./useSafeConvexAuth";
import { isDemoMode } from "../lib/supabase";

const OFFLINE =
  isDemoMode || import.meta.env.VITE_USE_CONVEX === "false";

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

function useUsageOffline(enabled: boolean) {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const data = await getUsageSummaryApi();
      setSummary(data);
    } catch {
      setSummary({
        tier: "free",
        isPremium: false,
        periodStart: new Date().toISOString().slice(0, 10),
        audio: { used: 0, allocated: 999, remaining: 999 },
        aiParses: { used: 0, allocated: 999, remaining: 999 },
      });
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, loading, refresh };
}

function useUsageConvex(enabled: boolean) {
  const convexBackend = useConvexBackend();
  const { isAuthenticated } = useSafeConvexAuth();
  const convexEnabled = enabled && convexBackend && isAuthenticated && !isDemoMode;
  const convexRow = useQuery(api.users.usageSummary, convexEnabled ? {} : "skip");

  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!convexEnabled) return;
    setSummary(mapConvexUsage(convexRow));
    setLoading(convexRow === undefined);
  }, [convexEnabled, convexRow]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (convexBackend && !isDemoMode) return;
    setLoading(true);
    try {
      const data = await getUsageSummaryApi();
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, convexBackend]);

  useEffect(() => {
    if (convexEnabled) return;
    void refresh();
  }, [convexEnabled, refresh]);

  return { summary, loading, refresh };
}

export const useUsage = OFFLINE ? useUsageOffline : useUsageConvex;
