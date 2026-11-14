import { useCallback, useEffect, useState } from "react";

import { getUsageSummaryApi, type UsageSummary } from "../lib/api";

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

export const useUsage = useUsageOffline;
