import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireAuthUserId } from "./requireAuth";

type AdminCtx = QueryCtx | MutationCtx;

export async function requireAdminUser(
  ctx: AdminCtx,
): Promise<{ userId: Id<"users">; user: Doc<"users"> }> {
  const userId = await requireAuthUserId(ctx);
  const user = await ctx.db.get("users", userId);
  if (!user || user.role !== "admin") {
    throw new Error("Admin access required");
  }
  return { userId, user };
}
