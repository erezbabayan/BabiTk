import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { phoneLookupVariants } from "./lib/greenApiParser";
import { normalizePhone } from "./lib/phone";
import {
  evaluateCaptureGate,
  isGroupWhatsAppChat,
  isPersonalWhatsAppChat,
  normalizeGroupChatId,
} from "./lib/whatsappCaptureGroup";

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
      .withIndex("phone", (q) => q.eq("phone", candidate))
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
    /** Extra phones to try (e.g. instance wid) when senderPhone is LID / device-odd. */
    fallbackPhones: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const candidates = [
      args.senderPhone,
      ...(args.fallbackPhones ?? []),
    ].filter((p) => p.trim().length > 0);

    let user: Doc<"users"> | null = null;
    let matchedPhone = normalizePhone(args.senderPhone);
    for (const candidate of candidates) {
      const normalized = normalizePhone(candidate);
      user = await lookupVerifiedUser(ctx, normalized);
      if (user) {
        matchedPhone = user.phone ? normalizePhone(user.phone) : normalized;
        break;
      }
    }

    return {
      messageId: args.messageId,
      senderId: args.senderId,
      senderPhone: matchedPhone,
      mediaType: args.messageType,
      resolved: Boolean(user),
      reason: user ? ("linked" as const) : ("not_linked" as const),
      userId: (user?._id ?? null) as Id<"users"> | null,
      tier: user?.tier ?? null,
    };
  },
});

/**
 * Allow ingest from the user's designated capture chat.
 * - Fail-closed when no chat is configured (only Message Yourself may auto-bind)
 * - Exact match on configured group / Message Yourself
 * - If a real group is configured, also allow Message Yourself (free-tier fallback)
 * - If still on default Message Yourself and owner posts in a group — auto-bind that group
 */
export const gateCaptureMessage = internalMutation({
  args: {
    userId: v.id("users"),
    chatId: v.string(),
    chatName: v.optional(v.string()),
  },
  returns: v.object({
    allowed: v.boolean(),
    reason: v.optional(v.string()),
    captureGroupChatId: v.optional(v.string()),
  }),
  handler: async (ctx, { userId, chatId, chatName }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) {
      return { allowed: false, reason: "user_not_found" };
    }

    const decision = evaluateCaptureGate(
      {
        phone: user.phone,
        captureGroupChatId: user.whatsappCaptureGroupChatId,
        captureGroupName: user.whatsappCaptureGroupName,
      },
      chatId,
      chatName,
    );

    if (!decision.allowed) {
      return { allowed: false, reason: decision.reason };
    }

    if (decision.bind) {
      const previous = user.whatsappCaptureGroupChatId?.trim() ?? "";
      await ctx.db.patch(userId, {
        whatsappCaptureGroupChatId: decision.bind.chatId,
        whatsappCaptureGroupName: decision.bind.name ?? undefined,
        ...(isGroupWhatsAppChat(decision.bind.chatId)
          ? { notifyWhatsAppGroup: true }
          : {}),
        updatedAt: Date.now(),
      });
      const upgradedToGroup =
        Boolean(previous) &&
        isPersonalWhatsAppChat(previous) &&
        isGroupWhatsAppChat(decision.bind.chatId);
      return {
        allowed: true,
        reason: upgradedToGroup ? "auto_upgraded_to_group" : undefined,
        captureGroupChatId: decision.bind.chatId,
      };
    }

    return {
      allowed: true,
      captureGroupChatId: user.whatsappCaptureGroupChatId
        ? normalizeGroupChatId(user.whatsappCaptureGroupChatId)
        : normalizeGroupChatId(chatId),
    };
  },
});
