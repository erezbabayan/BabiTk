import { getAuthUserId } from "@convex-dev/auth/server";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

/** Admin check for Node/public actions (no direct ctx.db). */
export async function requireAdminAction(ctx: ActionCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  const isAdmin = await ctx.runQuery(internal.users.isAdminInternal, { userId });
  if (!isAdmin) {
    throw new Error("Admin access required");
  }
  return userId;
}
