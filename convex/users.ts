import { v } from "convex/values";

import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { normalizePhone } from "./lib/phone";
import { userTier } from "./validators";

const DEFAULT_AUDIO_SECONDS = 1800;

export const getByLegacyId = query({
  args: { legacyId: v.string() },
  handler: async (ctx, { legacyId }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_legacy_id", (q) => q.eq("legacyId", legacyId))
      .unique();
  },
});

export const getByToken = query({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, { tokenIdentifier }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();
  },
});

/** Create or update a user row keyed by legacy Supabase/demo UUID. */
export const upsertByLegacyId = mutation({
  args: {
    legacyId: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerified: v.optional(v.boolean()),
    tier: v.optional(userTier),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_legacy_id", (q) => q.eq("legacyId", args.legacyId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email ?? existing.email,
        phone: args.phone !== undefined ? normalizePhone(args.phone) : existing.phone,
        phoneVerified: args.phoneVerified ?? existing.phoneVerified,
        tier: args.tier ?? existing.tier,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      legacyId: args.legacyId,
      email: args.email ?? `${args.legacyId}@demo.mindtasker.local`,
      phone: args.phone ? normalizePhone(args.phone) : undefined,
      phoneVerified: args.phoneVerified ?? false,
      tier: args.tier ?? "free",
      allocatedAudioSeconds: DEFAULT_AUDIO_SECONDS,
      usedAudioSeconds: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Bridge Supabase/demo UUID → Convex `users._id` for Web/Mobile.
 * Call on login when using Convex as the data backend.
 */
export const getOrCreateByLegacyId = mutation({
  args: {
    legacyId: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_legacy_id", (q) => q.eq("legacyId", args.legacyId))
      .unique();

    if (existing) {
      return {
        userId: existing._id,
        legacyId: existing.legacyId ?? args.legacyId,
        email: existing.email,
        phoneVerified: existing.phoneVerified,
      };
    }

    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      legacyId: args.legacyId,
      email: args.email ?? `${args.legacyId}@demo.mindtasker.local`,
      phoneVerified: false,
      tier: "free",
      allocatedAudioSeconds: DEFAULT_AUDIO_SECONDS,
      usedAudioSeconds: 0,
      createdAt: now,
      updatedAt: now,
    });

    return {
      userId,
      legacyId: args.legacyId,
      email: args.email ?? `${args.legacyId}@demo.mindtasker.local`,
      phoneVerified: false,
    };
  },
});

/** Attach Convex Auth subject when user signs in (future-ready). */
export const linkTokenIdentifier = mutation({
  args: {
    userId: v.id("users"),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, { userId, tokenIdentifier }) => {
    const conflict = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();

    if (conflict && conflict._id !== userId) {
      throw new Error("Token already linked to another account");
    }

    await ctx.db.patch(userId, {
      tokenIdentifier,
      updatedAt: Date.now(),
    });
  },
});

/** Link a verified WhatsApp phone to a user (settings / onboarding). */
export const linkVerifiedPhone = mutation({
  args: {
    userId: v.id("users"),
    phone: v.string(),
  },
  handler: async (ctx, { userId, phone }) => {
    const normalized = normalizePhone(phone);
    const now = Date.now();

    const conflict = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", normalized))
      .unique();

    if (conflict && conflict._id !== userId) {
      throw new Error("Phone number already linked to another account");
    }

    await ctx.db.patch(userId, {
      phone: normalized,
      phoneVerified: true,
      updatedAt: now,
    });

    return normalized;
  },
});

export const checkAudioQuota = internalQuery({
  args: {
    userId: v.id("users"),
    estimatedSeconds: v.number(),
  },
  handler: async (ctx, { userId, estimatedSeconds }) => {
    const user = await ctx.db.get(userId);
    if (!user) {
      return { allowed: false, remaining: 0 };
    }

    if (user.tier === "premium") {
      return { allowed: true, remaining: null };
    }

    const remaining = user.allocatedAudioSeconds - user.usedAudioSeconds;
    return {
      allowed: remaining >= estimatedSeconds,
      remaining,
    };
  },
});

export const recordAudioUsage = internalMutation({
  args: {
    userId: v.id("users"),
    seconds: v.number(),
  },
  handler: async (ctx, { userId, seconds }) => {
    const user = await ctx.db.get(userId);
    if (!user) return;

    await ctx.db.patch(userId, {
      usedAudioSeconds: user.usedAudioSeconds + seconds,
      updatedAt: Date.now(),
    });
  },
});
