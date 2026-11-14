import type { Id } from "../lib/ids";
import { asDirectConvexUserId } from "../lib/legacy-user-id";

/**
 * Convex is gone, so there is nothing to resolve: a non-UUID id passes
 * through as-is and Supabase UUIDs map to undefined (same as before, when
 * the Convex bridge was always disabled).
 */
export function useConvexUserId(
  legacyUserId: string | undefined,
  _email?: string,
): { convexUserId: Id<"users"> | undefined; resolving: boolean } {
  return { convexUserId: asDirectConvexUserId(legacyUserId), resolving: false };
}
