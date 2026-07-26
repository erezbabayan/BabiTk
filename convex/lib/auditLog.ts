import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function writeAuditLog(
  ctx: MutationCtx,
  entry: {
    actorUserId: Id<"users">;
    targetUserId?: Id<"users">;
    action: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.db.insert("auditLogs", {
    actorUserId: entry.actorUserId,
    targetUserId: entry.targetUserId,
    action: entry.action,
    details: entry.details,
    createdAt: Date.now(),
  });
}
