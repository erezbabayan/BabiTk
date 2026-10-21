import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { isConvexConfigured } from "../lib/convex";

export function useConvexPhoneLink(legacyUserId: string | undefined) {
  const enabled = isConvexConfigured && Boolean(legacyUserId);
  const getOrCreate = useMutation(api.users.getOrCreateByLegacyId);
  const [convexUserId, setConvexUserId] = useState<Id<"users"> | undefined>();

  useEffect(() => {
    if (!enabled || !legacyUserId) {
      setConvexUserId(undefined);
      return;
    }

    let cancelled = false;
    void getOrCreate({ legacyId: legacyUserId })
      .then((result) => {
        if (!cancelled) setConvexUserId(result.userId);
      })
      .catch((error) => {
        console.error("Failed to resolve Convex user for phone link", error);
        if (!cancelled) setConvexUserId(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, legacyUserId, getOrCreate]);

  const convexUser = useQuery(
    api.users.getByLegacyId,
    enabled && legacyUserId ? { legacyId: legacyUserId } : "skip",
  );
  const requestPhoneOtp = useAction(api.phoneOtpActions.requestPhoneOtp);
  const confirmPhoneOtp = useMutation(api.phoneOtp.confirmPhoneOtp);

  async function requestCode(rawPhone: string): Promise<string> {
    if (!convexUserId) {
      throw new Error("Convex user is not ready yet. Try again in a moment.");
    }
    const result = await requestPhoneOtp({ phone: rawPhone });
    return result.message;
  }

  async function confirmCode(code: string): Promise<string> {
    if (!convexUserId) {
      throw new Error("Convex user is not ready yet. Try again in a moment.");
    }
    return await confirmPhoneOtp({ code });
  }

  return {
    ready: Boolean(convexUserId),
    linkedPhone:
      convexUser?.phoneVerified && convexUser.phone ? convexUser.phone : null,
    requestCode,
    confirmCode,
  };
}
