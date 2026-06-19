import { useCallback, useEffect, useState } from "react";
import { getUsageSummary, type UsageSummary } from "../lib/api";

export function useUsage(enabled: boolean) {
  const [summary, setSummary] = useState<UsageSummary | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await getUsageSummary();
      setSummary(data);
    } catch {
      setSummary(null);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, refresh };
}
