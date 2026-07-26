import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { syncDigestLocalAlerts } from "../lib/digest-local-alerts";

/** Keep local OS alerts in sync with the user's WhatsApp digest hours. */
export function useDigestLocalAlerts(enabled: boolean): void {
  const viewer = useQuery(api.users.viewer, enabled ? {} : "skip");
  const lastFingerprint = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !viewer) return;

    const fingerprint = [
      viewer.notifyInApp !== false ? "1" : "0",
      (viewer.whatsappDigestHours ?? []).join(","),
      viewer.whatsappDigestDays ?? "everyday",
    ].join("|");
    if (lastFingerprint.current === fingerprint) return;
    lastFingerprint.current = fingerprint;

    let cancelled = false;
    void (async () => {
      try {
        await syncDigestLocalAlerts({
          enabled: viewer.notifyInApp !== false,
          hours: viewer.whatsappDigestHours,
          days: viewer.whatsappDigestDays,
        });
      } catch (error) {
        if (!cancelled) {
          // Allow a retry on the next effect if scheduling failed.
          lastFingerprint.current = null;
          console.warn(
            "[digest-local] schedule failed:",
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    viewer?.notifyInApp,
    viewer?.whatsappDigestHours?.join(","),
    viewer?.whatsappDigestDays,
  ]);
}
