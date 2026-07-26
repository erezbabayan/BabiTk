import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useConvexFeatures } from "../lib/data-backend";
import {
  hydrateConvexUserCache,
  readCachedConvexUserIdSync,
  resolveConvexUserId,
} from "../lib/convex-user-cache";
import { asDirectConvexUserId, isLegacyUuid } from "../lib/legacy-user-id";

export function useConvexUserId(
  legacyUserId: string | undefined,
  email?: string,
): { convexUserId: Id<"users"> | undefined; resolving: boolean } {
  const enabled = useConvexFeatures();
  const directConvexId = asDirectConvexUserId(legacyUserId);
  const getOrCreate = useMutation(api.users.getOrCreateByLegacyId);
  const getOrCreateRef = useRef(getOrCreate);
  getOrCreateRef.current = getOrCreate;

  const [convexUserId, setConvexUserId] = useState<Id<"users"> | undefined>(
    () =>
      directConvexId ??
      (legacyUserId ? readCachedConvexUserIdSync(legacyUserId) : undefined),
  );
  const [resolving, setResolving] = useState(
    () =>
      Boolean(
        enabled &&
          legacyUserId &&
          isLegacyUuid(legacyUserId) &&
          !readCachedConvexUserIdSync(legacyUserId),
      ),
  );

  useEffect(() => {
    if (directConvexId) {
      setConvexUserId(directConvexId);
      setResolving(false);
      return;
    }

    if (!enabled || !legacyUserId || !isLegacyUuid(legacyUserId)) {
      setConvexUserId(undefined);
      setResolving(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      const cached = await hydrateConvexUserCache(legacyUserId);
      if (cancelled) return;

      if (cached) {
        setConvexUserId(cached);
        setResolving(false);
        return;
      }

      setResolving(true);
      try {
        const userId = await resolveConvexUserId(legacyUserId, () =>
          getOrCreateRef.current({ legacyId: legacyUserId, email }),
        );
        if (!cancelled) {
          setConvexUserId(userId);
          setResolving(false);
        }
      } catch (error) {
        console.error("Failed to resolve Convex user", error);
        if (!cancelled) {
          setConvexUserId(undefined);
          setResolving(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [directConvexId, enabled, legacyUserId, email]);

  return { convexUserId, resolving };
}
