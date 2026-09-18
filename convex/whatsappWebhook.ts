import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { phoneLookupVariants } from "./lib/greenApiParser";
import { normalizePhone } from "./lib/phone";
import {
  isGroupWhatsAppChat,
  isPersonalWhatsAppChat,
  normalizeGroupChatId,
  personalCaptureChatId,
} from "./lib/whatsappCaptureGroup";

const messageType = v.union(
  v.literal("text"),
  v.literal("audio"),
  v.literal("image"),
  v.literal("unsupported"),
);

async function lookupUsersByPhone(
  ctx: QueryCtx | MutationCtx,
  phone: string,
): Promise<Doc<"users">[]> {
  const matches: Doc<"users">[] = [];
  const seen = new Set<string>();
  for (const candidate of phoneLookupVariants(phone)) {
    const rows = await ctx.db
      .query("users")
      .withIndex("phone", (q) => q.eq("phone", candidate))
      .take(8);
    for (const row of rows) {
      if (!seen.has(row._id)) {
        seen.add(row._id);
        matches.push(row);
      }
    }
  }
  return matches;
}

async function lookupVerifiedUser(
  ctx: QueryCtx | MutationCtx,
  phone: string,
): Promise<Doc<"users"> | null> {
  const matches = await lookupUsersByPhone(ctx, phone);
  const verified = matches.filter((row) => row.phoneVerified === true);
  return verified[0] ?? null;
}

async function confirmClaimedPhone(
  ctx: MutationCtx,
  phone: string,
): Promise<Doc<"users"> | null> {
  const matches = await lookupUsersByPhone(ctx, phone);
  const verified = matches.filter((row) => row.phoneVerified === true);
  if (verified.length === 1) {
    return verified[0]!;
  }
  if (verified.length > 1) {
    return null;
  }
  const claimants = matches.filter((row) => row.phoneVerified !== true);
  if (claimants.length !== 1) {
    return null;
  }
  const user = claimants[0]!;
  await ctx.db.patch(user._id, {
    phoneVerified: true,
    updatedAt: Date.now(),
  });
  return { ...user, phoneVerified: true };
}

async function lookupUserByCaptureChat(
  ctx: QueryCtx | MutationCtx,
  chatId: string,
): Promise<Doc<"users"> | null> {
  const normalized = normalizeGroupChatId(chatId);
  const rows = await ctx.db
    .query("users")
    .withIndex("by_capture_group", (q) =>
      q.eq("whatsappCaptureGroupChatId", normalized),
    )
    .take(3);
  const verified = rows.filter((row) => row.phoneVerified === true);
  if (verified.length === 1) {
    return verified[0]!;
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
    instanceWid: v.optional(v.string()),
    chatId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const widDigits = args.instanceWid
      ? normalizePhone(args.instanceWid).replace(/\D/g, "")
      : "";

    const isWidPhone = (value: string): boolean => {
      if (!widDigits) return false;
      const digits = normalizePhone(value).replace(/\D/g, "");
      return digits.length >= 10 && digits === widDigits;
    };

    if (args.chatId && isGroupWhatsAppChat(args.chatId)) {
      const byGroup = await lookupUserByCaptureChat(ctx, args.chatId);
      if (byGroup) {
        return {
          messageId: args.messageId,
          senderId: args.senderId,
          senderPhone: byGroup.phone
            ? normalizePhone(byGroup.phone)
            : normalizePhone(args.senderPhone),
          mediaType: args.messageType,
          resolved: true,
          reason: "linked" as const,
          userId: byGroup._id,
          tier: byGroup.tier ?? null,
        };
      }
    }

    const candidates = [
      args.senderPhone,
      ...(args.fallbackPhones ?? []),
    ].filter((p) => {
      const trimmed = p.trim();
      if (!trimmed) return false;
      if (trimmed.toLowerCase().endsWith("@lid")) return false;
      if (trimmed.toLowerCase().endsWith("@g.us")) return false;
      // Extra fallbacks must not be the shared instance number.
      if (p !== args.senderPhone && isWidPhone(trimmed)) return false;
      return true;
    });

    const isPersonalChat = Boolean(
      args.chatId && isPersonalWhatsAppChat(args.chatId),
    );

    let user: Doc<"users"> | null = null;
    let matchedPhone = normalizePhone(args.senderPhone);
    for (const candidate of candidates) {
      const normalized = normalizePhone(candidate);
      user = await lookupVerifiedUser(ctx, normalized);
      if (!user && isPersonalChat) {
        const expected = personalCaptureChatId(normalized);
        if (
          expected &&
          args.chatId &&
          normalizeGroupChatId(expected) === normalizeGroupChatId(args.chatId)
        ) {
          user = await confirmClaimedPhone(ctx, normalized);
        }
      }
      if (user) {
        matchedPhone = user.phone ? normalizePhone(user.phone) : normalized;
        break;
      }
    }

    if (!user && args.chatId) {
      user = await lookupUserByCaptureChat(ctx, args.chatId);
      if (user?.phone) {
        matchedPhone = normalizePhone(user.phone);
      }
    }

    if (!user) {
      return {
        messageId: args.messageId,
        senderId: args.senderId,
        senderPhone: matchedPhone,
        mediaType: args.messageType,
        resolved: false,
        reason: "not_linked" as const,
        userId: null as Id<"users"> | null,
        tier: null,
      };
    }

    return {
      messageId: args.messageId,
      senderId: args.senderId,
      senderPhone: matchedPhone,
      mediaType: args.messageType,
      resolved: true,
      reason: "linked" as const,
      userId: user._id,
      tier: user.tier ?? null,
    };
  },
});

/**
 * Allow ingest from the user's designated capture chat.
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

    const incoming = normalizeGroupChatId(chatId);
    const configured = user.whatsappCaptureGroupChatId?.trim();
    const personalId = personalCaptureChatId(user.phone);
    const others = await ctx.db
      .query("users")
      .withIndex("by_capture_group", (q) =>
        q.eq("whatsappCaptureGroupChatId", incoming),
      )
      .take(3);
    const takenByOther = others.some((row) => row._id !== userId);

    if (!configured) {
      const expectedPersonal =
        personalId && normalizeGroupChatId(personalId) === incoming;
      if (!expectedPersonal || user.phoneVerified !== true) {
        return { allowed: false, reason: "capture_group_not_configured" };
      }
      if (takenByOther) {
        return { allowed: false, reason: "capture_group_taken" };
      }
      await ctx.db.patch(userId, {
        whatsappCaptureGroupChatId: incoming,
        whatsappCaptureGroupName: chatName?.trim() || "הודעה לעצמי (BabiTk)",
        updatedAt: Date.now(),
      });
      return { allowed: true, captureGroupChatId: incoming };
    }

    const configuredNorm = normalizeGroupChatId(configured);
    if (configuredNorm === incoming) {
      return { allowed: true, captureGroupChatId: configured };
    }

    // Group is primary — still accept Message Yourself posts.
    if (
      isGroupWhatsAppChat(configuredNorm) &&
      personalId &&
      normalizeGroupChatId(personalId) === incoming
    ) {
      return { allowed: true, captureGroupChatId: configured };
    }

    // Stuck on default Message Yourself: first exclusive owner group post
    // may upgrade, but never steal another account's group.
    if (isPersonalWhatsAppChat(configuredNorm) && isGroupWhatsAppChat(incoming)) {
      const name = user.whatsappCaptureGroupName?.trim() ?? "";
      const isDefaultPersonal =
        !name ||
        name.includes("הודעה לעצמי") ||
        name.toLowerCase().includes("babitk") ||
        name.toLowerCase().includes("message yourself");
      if (isDefaultPersonal && !takenByOther) {
        await ctx.db.patch(userId, {
          whatsappCaptureGroupChatId: incoming,
          whatsappCaptureGroupName: chatName?.trim() || "קבוצת קליטה",
          updatedAt: Date.now(),
        });
        return { allowed: true, reason: "auto_upgraded_to_group", captureGroupChatId: incoming };
      }
    }

    return { allowed: false, reason: "wrong_capture_group" };
  },
});
