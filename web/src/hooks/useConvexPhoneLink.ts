import { useAction, useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { useConvexBackend } from "../lib/data-backend";
import { useConvexUserId } from "./useConvexUserId";

export function useConvexPhoneLink(legacyUserId: string | undefined) {
  const enabled = useConvexBackend() && Boolean(legacyUserId);
  const { convexUserId } = useConvexUserId(legacyUserId);
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
