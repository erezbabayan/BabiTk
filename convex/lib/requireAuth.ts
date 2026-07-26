import { getAuthUserId } from "@convex-dev/auth/server";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AuthCtx = QueryCtx | MutationCtx;

/** Convex Auth user id — throws when the caller is not signed in. */
export async function requireAuthUserId(ctx: AuthCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  return userId;
}

/**
 * Use the authenticated user's id for data access.
 * Rejects requests that try to act on another user's id.
 */
export async function requireScopedUserId(
  ctx: AuthCtx,
  requestedUserId: Id<"users">,
): Promise<Id<"users">> {
  const authUserId = await requireAuthUserId(ctx);
  if (authUserId !== requestedUserId) {
    throw new Error("Unauthorized");
  }
  return authUserId;
}
