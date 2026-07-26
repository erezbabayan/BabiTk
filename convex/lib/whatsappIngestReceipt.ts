import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type WhatsappIngestReceiptReason =
  | "ingested"
  | "deleted"
  | "duplicate"
  | "skipped";

export function readWhatsappMessageId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = (metadata as { whatsapp_message_id?: unknown }).whatsapp_message_id;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getWhatsappIngestReceipt(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  messageId: string,
) {
  return await ctx.db
    .query("whatsappIngestReceipts")
    .withIndex("by_user_message", (q) =>
      q.eq("userId", userId).eq("messageId", messageId),
    )
    .first();
}

export async function hasWhatsappIngestReceipt(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  messageId: string,
): Promise<boolean> {
  return (await getWhatsappIngestReceipt(ctx, userId, messageId)) !== null;
}

/**
 * True when capture backfill must NOT reschedule this message.
 * Soft-deleted board rows are treated as done — never resurrect trash.
 * Orphan "ingested"/"duplicate" receipts (no board row) stay incomplete so
 * yellowCard / OCR recovery can retry.
 */
export async function isWhatsappCaptureComplete(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  messageId: string,
): Promise<boolean> {
  if (await findExistingWhatsappItem(ctx, userId, messageId)) {
    return true;
  }
  const receipt = await getWhatsappIngestReceipt(ctx, userId, messageId);
  if (!receipt) return false;
  // Explicit tombstones — never resurrect.
  if (receipt.reason === "deleted" || receipt.reason === "skipped") {
    return true;
  }
  // Orphan ingested/duplicate with no task/notebook — allow retry.
  return false;
}

export async function ensureWhatsappIngestReceipt(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    messageId: string;
    reason: WhatsappIngestReceiptReason;
  },
): Promise<Id<"whatsappIngestReceipts">> {
  const existing = await ctx.db
    .query("whatsappIngestReceipts")
    .withIndex("by_user_message", (q) =>
      q.eq("userId", args.userId).eq("messageId", args.messageId),
    )
    .first();
  if (existing) {
    // Deletion must always win — never leave a stale "ingested" that resurrects trash.
    if (args.reason === "deleted" && existing.reason !== "deleted") {
      await ctx.db.patch(existing._id, { reason: "deleted" });
    }
    return existing._id;
  }

  return await ctx.db.insert("whatsappIngestReceipts", {
    userId: args.userId,
    messageId: args.messageId,
    reason: args.reason,
    createdAt: Date.now(),
  });
}

function metadataMatchesMessageId(
  metadata: unknown,
  messageId: string,
): boolean {
  return readWhatsappMessageId(metadata) === messageId;
}

/** True if this WhatsApp message already produced a task/notebook (live or soft-deleted). */
export async function findExistingWhatsappItem(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  messageId: string,
): Promise<boolean> {
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(400);
  if (tasks.some((row) => metadataMatchesMessageId(row.metadata, messageId))) {
    return true;
  }

  const notebooks = await ctx.db
    .query("notebooks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(400);
  return notebooks.some((row) =>
    metadataMatchesMessageId(row.metadata, messageId),
  );
}

/** Live (non-deleted) board row for this WhatsApp message — used by capture recovery. */
export async function findLiveWhatsappItem(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  messageId: string,
): Promise<boolean> {
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(400);
  if (
    tasks.some(
      (row) =>
        row.deletedAt == null &&
        metadataMatchesMessageId(row.metadata, messageId),
    )
  ) {
    return true;
  }

  const notebooks = await ctx.db
    .query("notebooks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(400);
  return notebooks.some(
    (row) =>
      row.deletedAt == null &&
      metadataMatchesMessageId(row.metadata, messageId),
  );
}
