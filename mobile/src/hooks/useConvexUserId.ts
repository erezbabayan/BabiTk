import { useEffect, useState } from "react";
import { useMutation } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useConvexBackend } from "../lib/data-backend";

export function useConvexUserId(
  legacyUserId: string | undefined,
  email?: string,
): Id<"users"> | undefined {
  const enabled = useConvexBackend();
  const getOrCreate = useMutation(api.users.getOrCreateByLegacyId);
  const [convexUserId, setConvexUserId] = useState<Id<"users"> | undefined>();

  useEffect(() => {
    if (!enabled || !legacyUserId) {
      setConvexUserId(undefined);
      return;
    }

    let cancelled = false;
    void getOrCreate({ legacyId: legacyUserId, email })
      .then((result) => {
        if (!cancelled) setConvexUserId(result.userId);
      })
      .catch((error) => {
        console.error("Failed to resolve Convex user", error);
        if (!cancelled) setConvexUserId(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, legacyUserId, email, getOrCreate]);

  return convexUserId;
}
