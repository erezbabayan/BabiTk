import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useConvexFeatures } from "../lib/data-backend";
import {
  readCachedConvexUserId,
  resolveConvexUserId,
} from "../lib/convex-user-cache";
import { asDirectConvexUserId, isLegacyUuid } from "../lib/legacy-user-id";
import { isDemoMode } from "../lib/supabase";

const OFFLINE =
  isDemoMode || import.meta.env.VITE_USE_CONVEX === "false";

function useConvexUserIdOffline(
  _legacyUserId: string | undefined,
  _email?: string,
): { convexUserId: Id<"users"> | undefined; resolving: boolean } {
  return { convexUserId: undefined, resolving: false };
}

function useConvexUserIdConvex(
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
      (legacyUserId && isLegacyUuid(legacyUserId)
        ? readCachedConvexUserId(legacyUserId)
        : undefined),
  );
  const [resolving, setResolving] = useState(() =>
    Boolean(
      enabled &&
        legacyUserId &&
        isLegacyUuid(legacyUserId) &&
        !readCachedConvexUserId(legacyUserId),
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

    const cached = readCachedConvexUserId(legacyUserId);
    if (cached) {
      setConvexUserId(cached);
      setResolving(false);
      return;
    }

    let cancelled = false;
    setResolving(true);

    void resolveConvexUserId(legacyUserId, () =>
      getOrCreateRef.current({ legacyId: legacyUserId, email }),
    )
      .then((userId) => {
        if (!cancelled) {
          setConvexUserId(userId);
          setResolving(false);
        }
      })
      .catch((error) => {
        console.error("Failed to resolve Convex user", error);
        if (!cancelled) {
          setConvexUserId(undefined);
          setResolving(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [directConvexId, enabled, legacyUserId, email]);

  return { convexUserId, resolving };
}

export const useConvexUserId = OFFLINE
  ? useConvexUserIdOffline
  : useConvexUserIdConvex;
