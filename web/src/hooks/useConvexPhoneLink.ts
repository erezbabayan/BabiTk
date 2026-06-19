import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useConvexBackend } from "../lib/data-backend";
import { useConvexUserId } from "./useConvexUserId";

export function useConvexPhoneLink(legacyUserId: string | undefined) {
  const enabled = useConvexBackend() && Boolean(legacyUserId);
  const convexUserId = useConvexUserId(legacyUserId);
  const convexUser = useQuery(
    api.users.getByLegacyId,
    enabled && legacyUserId ? { legacyId: legacyUserId } : "skip",
  );
  const linkVerifiedPhone = useMutation(api.users.linkVerifiedPhone);

  async function linkPhone(rawPhone: string): Promise<string> {
    if (!convexUserId) {
      throw new Error("Convex user is not ready yet. Try again in a moment.");
    }

    return await linkVerifiedPhone({
      userId: convexUserId as Id<"users">,
      phone: rawPhone,
    });
  }

  return {
    ready: Boolean(convexUserId),
    linkedPhone:
      convexUser?.phoneVerified && convexUser.phone ? convexUser.phone : null,
    linkPhone,
  };
}
