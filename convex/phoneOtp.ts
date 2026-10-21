import { v } from "convex/values";

import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { PHONE_OTP_ERRORS, judgeOtpVerify } from "./lib/phone_otp";
import { normalizePhone } from "./lib/phone";
import { requireAuthUserId } from "./lib/requireAuth";

export const loadState = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("משתמש לא נמצא");
    return {
      userId,
      phone: user.phone ?? null,
      phoneVerified: user.phoneVerified === true,
      pending: user.phonePending ?? null,
      hash: user.phoneOtpHash ?? null,
      expiresAt: user.phoneOtpExpiresAt ?? null,
      attempts: user.phoneOtpAttempts ?? 0,
      sentAt: user.phoneOtpSentAt ?? [],
      captureChatId: user.whatsappCaptureGroupChatId ?? null,
      captureName: user.whatsappCaptureGroupName ?? null,
    };
  },
});

export const phoneTaken = internalQuery({
  args: { phone: v.string(), userId: v.id("users") },
  handler: async (ctx, { phone, userId }) => {
    const conflict = await ctx.db
      .query("users")
      .withIndex("phone", (q) => q.eq("phone", phone))
      .unique();
    return Boolean(conflict && conflict._id !== userId);
  },
});

export const storeChallenge = internalMutation({
  args: {
    userId: v.id("users"),
    phone: v.string(),
    hash: v.string(),
    expiresAt: v.number(),
    sentAt: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    await ctx.db.patch(userId, {
      phonePending: args.phone,
      phoneOtpHash: args.hash,
      phoneOtpExpiresAt: args.expiresAt,
      phoneOtpAttempts: 0,
      phoneOtpSentAt: args.sentAt,
      updatedAt: Date.now(),
    });
  },
});

export const restoreChallenge = internalMutation({
  args: {
    userId: v.id("users"),
    pending: v.union(v.string(), v.null()),
    hash: v.union(v.string(), v.null()),
    expiresAt: v.union(v.number(), v.null()),
    attempts: v.number(),
    sentAt: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    await ctx.db.patch(userId, {
      phonePending: args.pending ?? "",
      phoneOtpHash: args.hash ?? "",
      phoneOtpExpiresAt: args.expiresAt ?? 0,
      phoneOtpAttempts: args.attempts,
      phoneOtpSentAt: args.sentAt,
      updatedAt: Date.now(),
    });
  },
});

export const confirmPhoneOtp = mutation({
  args: { code: v.string() },
  returns: v.string(),
  handler: async (ctx, { code }) => {
    const userId = await requireAuthUserId(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("משתמש לא נמצא");
    const verdict = await judgeOtpVerify({
      pending: user.phonePending ?? null,
      hash: user.phoneOtpHash ?? null,
      expiresAt: user.phoneOtpExpiresAt ? new Date(user.phoneOtpExpiresAt).toISOString() : null,
      attempts: user.phoneOtpAttempts ?? 0,
      code,
      nowMs: Date.now(),
    });
    if (!verdict.ok) {
      if (verdict.error === "mismatch" || verdict.error === "too_many") {
        await ctx.db.patch(userId, { phoneOtpAttempts: verdict.attempts, updatedAt: Date.now() });
      }
      throw new Error(PHONE_OTP_ERRORS[verdict.error]);
    }
    const phone = normalizePhone(user.phonePending ?? "");
    const conflict = await ctx.db
      .query("users")
      .withIndex("phone", (q) => q.eq("phone", phone))
      .unique();
    if (conflict && conflict._id !== userId) {
      throw new Error(PHONE_OTP_ERRORS.taken);
    }
    const digits = phone.replace(/\D/g, "");
    const patch: {
      phone: string;
      phoneVerified: true;
      phonePending: string;
      phoneOtpHash: string;
      phoneOtpExpiresAt: number;
      phoneOtpAttempts: number;
      updatedAt: number;
      whatsappCaptureGroupChatId?: string;
      whatsappCaptureGroupName?: string;
    } = {
      phone,
      phoneVerified: true,
      phonePending: "",
      phoneOtpHash: "",
      phoneOtpExpiresAt: 0,
      phoneOtpAttempts: 0,
      updatedAt: Date.now(),
    };
    if (!user.whatsappCaptureGroupChatId?.trim() && digits.length >= 10) {
      patch.whatsappCaptureGroupChatId = `${digits}@c.us`;
      patch.whatsappCaptureGroupName = user.whatsappCaptureGroupName?.trim() || "הודעה לעצמי (BabiTk)";
    }
    await ctx.db.patch(userId, patch);
    return phone;
  },
});
