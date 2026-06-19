import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { phoneLookupVariants } from "./lib/greenApiParser";
import { normalizePhone } from "./lib/phone";

const messageType = v.union(
  v.literal("text"),
  v.literal("audio"),
  v.literal("image"),
  v.literal("unsupported"),
);

async function lookupVerifiedUser(
  ctx: QueryCtx | MutationCtx,
  phone: string,
): Promise<Doc<"users"> | null> {
  for (const candidate of phoneLookupVariants(phone)) {
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", candidate))
      .unique();

    if (user?.phoneVerified) {
      return user;
    }
  }

  return null;
}

export const findVerifiedByPhone = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const user = await lookupVerifiedUser(ctx, phone);
    if (!user) return null;

    return {
      userId: user._id,
      email: user.email,
      phone: user.phone ?? normalizePhone(phone),
      tier: user.tier,
    };
  },
});

/**
 * Step B — map Green-API sender_id (phone digits) to a verified Convex user.
 */
export const resolveGreenApiSender = internalMutation({
  args: {
    messageId: v.string(),
    senderId: v.string(),
    senderPhone: v.string(),
    messageType,
  },
  handler: async (ctx, args) => {
    const senderPhone = normalizePhone(args.senderPhone);
    const user = await lookupVerifiedUser(ctx, senderPhone);

    return {
      messageId: args.messageId,
      senderId: args.senderId,
      senderPhone,
      mediaType: args.messageType,
      resolved: Boolean(user),
      reason: user ? ("linked" as const) : ("not_linked" as const),
      userId: (user?._id ?? null) as Id<"users"> | null,
      tier: user?.tier ?? null,
    };
  },
});
