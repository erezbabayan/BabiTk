import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { phoneLookupVariants } from "./lib/greenApiParser";
import { normalizePhone } from "./lib/phone";
import { isGroupWhatsAppChat, normalizeGroupChatId } from "./lib/whatsappCaptureGroup";
import {
  CALLMEBOT_ACTIVATE_URL,
  CALLMEBOT_BOT_NUMBERS,
  CALLMEBOT_PRIMARY_BOT,
  callMeBotActivateUrl,
  callMeBotRecoveryUrl,
} from "./lib/callMeBot";
import {
  isSelfReferentialLegacyId,
  legacyIdMatchesAuthUser,
  storedLegacyIdMatchesRequest,
} from "./lib/legacyUserId";
import { requireAuthUserId, requireScopedUserId } from "./lib/requireAuth";
import { resolveStoredUserNameParts, splitFullName } from "./lib/userDisplayName";
import { userTier } from "./validators";

const DEFAULT_AUDIO_SECONDS = 1800;

export const getEmailInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    return user?.email ?? null;
  },
});

export const getPhoneInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      phone: v.string(),
      phoneVerified: v.boolean(),
      name: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    if (!user?.phone || user.phoneVerified !== true) return null;
    return {
      phone: user.phone,
      phoneVerified: true,
      name: user.name ?? null,
    };
  },
});

/** Lightweight auth check for mobile bootstrap (no full profile). */
export const authUserId = query({
  args: {},
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx) => {
    return await getAuthUserId(ctx);
  },
});

export const viewer = query({
  args: {},
  returns: v.union(
    v.object({
      userId: v.id("users"),
      email: v.union(v.string(), v.null()),
      name: v.union(v.string(), v.null()),
      firstName: v.union(v.string(), v.null()),
      lastName: v.union(v.string(), v.null()),
      image: v.union(v.string(), v.null()),
      legacyId: v.union(v.string(), v.null()),
      tier: v.union(userTier, v.null()),
      role: v.union(v.literal("admin"), v.literal("user"), v.null()),
      isPremium: v.boolean(),
      isAdmin: v.boolean(),
      phone: v.union(v.string(), v.null()),
      phoneVerified: v.boolean(),
      notifyInApp: v.boolean(),
      notifyWhatsApp: v.boolean(),
      /** Send due reminders to the configured WhatsApp capture group. */
      notifyWhatsAppGroup: v.boolean(),
      /** Repeat-nag open items past their reminder. */
      notifyOverdueReminders: v.boolean(),
      /** Hours after fire before first overdue nag (default 24). */
      overdueFirstHours: v.number(),
      /** Hours between subsequent overdue nags (default 48). */
      overdueRepeatHours: v.number(),
      keepAlertsArmed: v.boolean(),
      /** Up to 3 local hours 0–23 for daily WhatsApp digests (default [9]). */
      whatsappDigestHours: v.array(v.number()),
      /** weekdays (א׳–ה׳) or everyday — default everyday. */
      whatsappDigestDays: v.union(v.literal("weekdays"), v.literal("everyday")),
      /** Personal CallMeBot key saved (enables WhatsApp digests without Green/Meta). */
      hasCallMeBotKey: v.boolean(),
      /** Deep link to activate CallMeBot once on WhatsApp. */
      callMeBotActivateUrl: v.string(),
      /** Current recommended bot number (E.164). */
      callMeBotBotPhone: v.string(),
      /** If primary bot fails, try these wa.me links. */
      callMeBotAlternateActivateUrls: v.array(v.string()),
      callMeBotRecoveryUrl: v.string(),
      whatsappCaptureGroupChatId: v.union(v.string(), v.null()),
      whatsappCaptureGroupName: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get("users", userId);
    if (!user) return null;

    const nameParts = resolveStoredUserNameParts(user);

    return {
      userId,
      email: user.email ?? null,
      name: user.name ?? null,
      firstName: nameParts?.firstName ?? null,
      lastName: nameParts?.lastName ?? null,
      image: user.image ?? null,
      legacyId: user.legacyId ?? null,
      tier: user.tier ?? "free",
      role: user.role ?? "user",
      isPremium: user.tier === "premium",
      isAdmin: user.role === "admin",
      phone: user.phone ?? null,
      phoneVerified: user.phoneVerified === true,
      notifyInApp: user.notifyInApp !== false,
      notifyWhatsApp: user.notifyWhatsApp !== false,
      notifyWhatsAppGroup: user.notifyWhatsAppGroup === true,
      notifyOverdueReminders: user.notifyOverdueReminders !== false,
      overdueFirstHours:
        typeof user.overdueFirstHours === "number" &&
        Number.isFinite(user.overdueFirstHours) &&
        user.overdueFirstHours >= 1
          ? Math.min(168, Math.floor(user.overdueFirstHours))
          : 24,
      overdueRepeatHours:
        typeof user.overdueRepeatHours === "number" &&
        Number.isFinite(user.overdueRepeatHours) &&
        user.overdueRepeatHours >= 1
          ? Math.min(168, Math.floor(user.overdueRepeatHours))
          : 48,
      keepAlertsArmed: user.keepAlertsArmed === true,
      whatsappDigestHours: normalizeDigestHours(
        user.whatsappDigestHours,
        user.whatsappDigestHour,
      ),
      whatsappDigestDays: (user.whatsappDigestDays === "weekdays"
        ? "weekdays"
        : "everyday") as "weekdays" | "everyday",
      hasCallMeBotKey: Boolean(user.callMeBotApiKey?.trim()),
      callMeBotActivateUrl: CALLMEBOT_ACTIVATE_URL,
      callMeBotBotPhone: CALLMEBOT_PRIMARY_BOT,
      callMeBotAlternateActivateUrls: CALLMEBOT_BOT_NUMBERS.filter(
        (n) => n !== CALLMEBOT_PRIMARY_BOT,
      ).map(callMeBotActivateUrl),
      callMeBotRecoveryUrl: callMeBotRecoveryUrl(CALLMEBOT_PRIMARY_BOT),
      whatsappCaptureGroupChatId: user.whatsappCaptureGroupChatId ?? null,
      whatsappCaptureGroupName: user.whatsappCaptureGroupName ?? null,
    };
  },
});

const MAX_DIGEST_HOURS = 3;

function normalizeDigestHours(
  hours: number[] | undefined,
  legacyHour: number | undefined,
): number[] {
  const source =
    Array.isArray(hours) && hours.length > 0
      ? hours
      : typeof legacyHour === "number"
        ? [legacyHour]
        : [9];
  const unique = [
    ...new Set(
      source.filter(
        (hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23,
      ),
    ),
  ].sort((a, b) => a - b);
  return unique.length > 0 ? unique.slice(0, MAX_DIGEST_HOURS) : [9];
}

export const updateNotificationPrefs = mutation({
  args: {
    notifyInApp: v.optional(v.boolean()),
    notifyWhatsApp: v.optional(v.boolean()),
    notifyWhatsAppGroup: v.optional(v.boolean()),
    notifyOverdueReminders: v.optional(v.boolean()),
    overdueFirstHours: v.optional(v.number()),
    overdueRepeatHours: v.optional(v.number()),
    keepAlertsArmed: v.optional(v.boolean()),
    whatsappDigestHours: v.optional(v.array(v.number())),
    whatsappDigestDays: v.optional(
      v.union(v.literal("weekdays"), v.literal("everyday")),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const patch: {
      notifyInApp?: boolean;
      notifyWhatsApp?: boolean;
      notifyWhatsAppGroup?: boolean;
      notifyOverdueReminders?: boolean;
      overdueFirstHours?: number;
      overdueRepeatHours?: number;
      keepAlertsArmed?: boolean;
      whatsappDigestHours?: number[];
      whatsappDigestDays?: "weekdays" | "everyday";
      updatedAt: number;
    } = { updatedAt: Date.now() };
    if (args.notifyInApp !== undefined) patch.notifyInApp = args.notifyInApp;
    if (args.notifyWhatsApp !== undefined) patch.notifyWhatsApp = args.notifyWhatsApp;
    if (args.notifyWhatsAppGroup !== undefined) {
      patch.notifyWhatsAppGroup = args.notifyWhatsAppGroup;
    }
    if (args.notifyOverdueReminders !== undefined) {
      patch.notifyOverdueReminders = args.notifyOverdueReminders;
    }
    if (args.overdueFirstHours !== undefined) {
      if (
        !Number.isInteger(args.overdueFirstHours) ||
        args.overdueFirstHours < 1 ||
        args.overdueFirstHours > 168
      ) {
        throw new Error("זמן התראה ראשונה חייב להיות בין 1 ל-168 שעות");
      }
      patch.overdueFirstHours = args.overdueFirstHours;
    }
    if (args.overdueRepeatHours !== undefined) {
      if (
        !Number.isInteger(args.overdueRepeatHours) ||
        args.overdueRepeatHours < 1 ||
        args.overdueRepeatHours > 168
      ) {
        throw new Error("מרווח התראה חוזרת חייב להיות בין 1 ל-168 שעות");
      }
      patch.overdueRepeatHours = args.overdueRepeatHours;
    }
    if (args.keepAlertsArmed !== undefined) {
      // Legacy field — kept for schema compat. Does not start a background process.
      patch.keepAlertsArmed = args.keepAlertsArmed;
    }
    if (args.whatsappDigestHours !== undefined) {
      if (args.whatsappDigestHours.length === 0) {
        throw new Error("יש לבחור לפחות שעת שליחה אחת");
      }
      if (args.whatsappDigestHours.length > MAX_DIGEST_HOURS) {
        throw new Error(`ניתן לבחור עד ${MAX_DIGEST_HOURS} מועדים`);
      }
      for (const hour of args.whatsappDigestHours) {
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
          throw new Error("שעות תזכורת יומית חייבות להיות בין 0 ל-23");
        }
      }
      patch.whatsappDigestHours = [
        ...new Set(args.whatsappDigestHours),
      ].sort((a, b) => a - b);
    }
    if (args.whatsappDigestDays !== undefined) {
      patch.whatsappDigestDays = args.whatsappDigestDays;
    }
    await ctx.db.patch(userId, patch);
    return null;
  },
});

/** Save the WhatsApp chat used for capture (group @g.us or personal Message Yourself). */
export const saveWhatsAppCaptureGroup = mutation({
  args: {
    chatId: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { chatId, name }) => {
    const userId = await requireAuthUserId(ctx);
    const trimmed = chatId.trim();
    const isGroup = isGroupWhatsAppChat(trimmed);
    const isPersonal = trimmed.endsWith("@c.us");
    if (!isGroup && !isPersonal) {
      throw new Error("מזהה צ'אט חייב להסתיים ב־@g.us (קבוצה) או @c.us (הודעה לעצמי)");
    }
    await ctx.db.patch(userId, {
      whatsappCaptureGroupChatId: normalizeGroupChatId(trimmed),
      whatsappCaptureGroupName:
        name?.trim() || (isPersonal ? "הודעה לעצמי (BabiTk)" : "BabiTk"),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const clearWhatsAppCaptureGroup = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    await ctx.db.patch(userId, {
      whatsappCaptureGroupChatId: undefined,
      whatsappCaptureGroupName: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Stable free-tier capture: bind WhatsApp «Message Yourself» for the signed-in user. */
export const enablePersonalCapture = mutation({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    chatId: v.optional(v.string()),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const user = await ctx.db.get("users", userId);
    if (!user?.phone || user.phoneVerified !== true) {
      return { ok: false, reason: "phone_not_verified" };
    }
    const digits = normalizePhone(user.phone).replace(/\D/g, "");
    const chatId = `${digits}@c.us`;
    await ctx.db.patch(userId, {
      whatsappCaptureGroupChatId: chatId,
      whatsappCaptureGroupName: "הודעה לעצמי (BabiTk)",
      updatedAt: Date.now(),
    });
    return { ok: true, chatId };
  },
});

export const getCaptureGroupInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      chatId: v.string(),
      name: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    const chatId = user?.whatsappCaptureGroupChatId?.trim();
    if (!chatId) return null;
    return {
      chatId: normalizeGroupChatId(chatId),
      name: user?.whatsappCaptureGroupName ?? null,
    };
  },
});

export const getCaptureSetupInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      phone: v.union(v.string(), v.null()),
      phoneVerified: v.boolean(),
      captureGroupChatId: v.union(v.string(), v.null()),
      captureGroupName: v.union(v.string(), v.null()),
      userName: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get("users", userId);
    if (!user) return null;
    const parts = resolveStoredUserNameParts(user);
    const userName =
      user.name?.trim() ||
      [parts?.firstName, parts?.lastName].filter(Boolean).join(" ").trim() ||
      null;
    return {
      phone: user.phone ?? null,
      phoneVerified: user.phoneVerified === true,
      captureGroupChatId: user.whatsappCaptureGroupChatId
        ? normalizeGroupChatId(user.whatsappCaptureGroupChatId)
        : null,
      captureGroupName: user.whatsappCaptureGroupName ?? null,
      userName,
    };
  },
});

const BABITK_GROUP_NAME_FALLBACK = "BabiTk";

export const bindCaptureGroupInternal = internalMutation({
  args: {
    userId: v.id("users"),
    chatId: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, chatId, name }) => {
    const trimmed = chatId.trim();
    const isGroup = isGroupWhatsAppChat(trimmed);
    const isPersonal = trimmed.endsWith("@c.us");
    if (!isGroup && !isPersonal) {
      throw new Error("מזהה צ'אט חייב להסתיים ב־@g.us או @c.us");
    }
    await ctx.db.patch(userId, {
      whatsappCaptureGroupChatId: normalizeGroupChatId(trimmed),
      whatsappCaptureGroupName:
        name?.trim() || (isPersonal ? "הודעה לעצמי (BabiTk)" : BABITK_GROUP_NAME_FALLBACK),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Ops: bind capture group for a user by email. */
export const setCaptureGroupByEmail = internalMutation({
  args: {
    email: v.optional(v.string()),
    chatId: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    userId: v.optional(v.id("users")),
    chatId: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const email = (args.email ?? "erezbabayan@gmail.com").trim().toLowerCase();
    const trimmed = args.chatId.trim();
    const isGroup = isGroupWhatsAppChat(trimmed);
    const isPersonal = trimmed.endsWith("@c.us");
    if (!isGroup && !isPersonal) {
      return { ok: false };
    }
    const users = await ctx.db.query("users").take(500);
    const user = users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (!user) return { ok: false };
    const normalized = normalizeGroupChatId(trimmed);
    await ctx.db.patch(user._id, {
      whatsappCaptureGroupChatId: normalized,
      whatsappCaptureGroupName:
        args.name?.trim() ||
        (isPersonal ? "הודעה לעצמי (BabiTk)" : user.whatsappCaptureGroupName),
      updatedAt: Date.now(),
    });
    return { ok: true, userId: user._id, chatId: normalized };
  },
});

export const saveCallMeBotApiKey = mutation({
  args: {
    apiKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { apiKey }) => {
    const userId = await requireAuthUserId(ctx);
    const trimmed = apiKey.trim();
    if (trimmed.length < 4 || trimmed.length > 64) {
      throw new Error("מפתח CallMeBot לא תקין");
    }
    if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
      throw new Error("מפתח CallMeBot לא תקין");
    }
    await ctx.db.patch(userId, {
      callMeBotApiKey: trimmed,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const clearCallMeBotApiKey = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    await ctx.db.patch(userId, {
      callMeBotApiKey: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Ops: clear stale/invalid CallMeBot key by email. */
export const clearCallMeBotKeyByEmail = internalMutation({
  args: { email: v.optional(v.string()) },
  returns: v.object({ ok: v.boolean(), cleared: v.boolean() }),
  handler: async (ctx, args) => {
    const email = (args.email ?? "erezbabayan@gmail.com").trim().toLowerCase();
    const users = await ctx.db.query("users").take(500);
    const user = users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (!user) return { ok: false, cleared: false };
    const had = Boolean(user.callMeBotApiKey?.trim());
    if (had) {
      await ctx.db.patch(user._id, {
        callMeBotApiKey: undefined,
        updatedAt: Date.now(),
      });
    }
    return { ok: true, cleared: had };
  },
});

export const getCallMeBotKeyByPhone = internalQuery({
  args: { phone: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { phone }) => {
    for (const candidate of phoneLookupVariants(phone)) {
      const user = await ctx.db
        .query("users")
        .withIndex("phone", (q) => q.eq("phone", candidate))
        .unique();
      const key = user?.callMeBotApiKey?.trim();
      if (key) return key;
    }
    return null;
  },
});

/** Ops: set CallMeBot key when user received it on WhatsApp but UI save failed. */
export const setCallMeBotKeyByEmail = internalMutation({
  args: {
    email: v.string(),
    apiKey: v.string(),
  },
  returns: v.object({
    ok: v.boolean(),
    userId: v.optional(v.id("users")),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, { email, apiKey }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const trimmed = apiKey.trim();
    if (!normalizedEmail) {
      return { ok: false, reason: "email_required" };
    }
    if (trimmed.length < 4 || trimmed.length > 64) {
      return { ok: false, reason: "invalid_api_key" };
    }
    if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
      return { ok: false, reason: "invalid_api_key" };
    }

    const users = await ctx.db.query("users").take(500);
    const user = users.find(
      (row) => (row.email ?? "").trim().toLowerCase() === normalizedEmail,
    );
    if (!user) {
      return { ok: false, reason: "user_not_found" };
    }

    await ctx.db.patch(user._id, {
      callMeBotApiKey: trimmed,
      updatedAt: Date.now(),
    });
    return { ok: true, userId: user._id };
  },
});

export const updateDisplayName = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const firstName = args.firstName.trim();
    const lastName = args.lastName.trim();
    if (!firstName) throw new Error("יש להזין שם פרטי");
    if (!lastName) throw new Error("יש להזין שם משפחה");

    const name = [firstName, lastName].join(" ");
    await ctx.db.patch(userId, {
      firstName,
      lastName,
      name,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Backfill or persist display name for the signed-in user (header). */
export const ensureDisplayName = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      firstName: v.string(),
      lastName: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const user = await ctx.db.get("users", userId);
    if (!user) return null;

    const existing = resolveStoredUserNameParts(user);
    if (existing?.firstName?.trim() && existing?.lastName?.trim()) {
      return existing;
    }

    const firstName = args.firstName?.trim() ?? existing?.firstName?.trim() ?? "";
    const lastName = args.lastName?.trim() ?? existing?.lastName?.trim() ?? "";
    if (firstName && lastName) {
      await ctx.db.patch(userId, {
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        updatedAt: Date.now(),
      });
      return { firstName, lastName };
    }

    if (user.name?.trim()) {
      const split = splitFullName(user.name);
      if (split.firstName || split.lastName) {
        await ctx.db.patch(userId, {
          firstName: split.firstName || undefined,
          lastName: split.lastName || undefined,
          name: user.name,
          updatedAt: Date.now(),
        });
        return split;
      }
    }

    return null;
  },
});

export const usageSummary = query({
  args: {},
  returns: v.union(
    v.object({
      tier: userTier,
      isPremium: v.boolean(),
      isAdmin: v.boolean(),
      periodStart: v.string(),
      audio: v.object({
        used: v.number(),
        allocated: v.number(),
        remaining: v.number(),
      }),
      aiParses: v.object({
        used: v.number(),
        allocated: v.number(),
        remaining: v.number(),
      }),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get("users", userId);
    if (!user) return null;

    const isPremium = user.tier === "premium" || user.role === "admin";
    const unlimited = Number.MAX_SAFE_INTEGER;
    const allocated = user.allocatedAudioSeconds ?? DEFAULT_AUDIO_SECONDS;
    const used = user.usedAudioSeconds ?? 0;

    return {
      tier: isPremium ? "premium" : (user.tier ?? "free"),
      isPremium,
      isAdmin: user.role === "admin",
      periodStart: new Date().toISOString(),
      audio: isPremium
        ? { used: 0, allocated: unlimited, remaining: unlimited }
        : {
            used,
            allocated,
            remaining: Math.max(0, allocated - used),
          },
      aiParses: isPremium
        ? { used: 0, allocated: unlimited, remaining: unlimited }
        : { used: 0, allocated: 3, remaining: 3 },
    };
  },
});

export const getByLegacyId = query({
  args: { legacyId: v.string() },
  handler: async (ctx, { legacyId }) => {
    const authUserId = await requireAuthUserId(ctx);
    const user = await ctx.db.get("users", authUserId);
    if (!user) return null;
    if (!storedLegacyIdMatchesRequest(authUserId, user.legacyId, legacyId)) {
      return null;
    }
    return user;
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
export const upsertByLegacyId = internalMutation({
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
    const authUserId = await requireAuthUserId(ctx);
    const user = await ctx.db.get("users", authUserId);
    if (!user) {
      throw new Error("User not found");
    }

    if (legacyIdMatchesAuthUser(authUserId, args.legacyId)) {
      const placeholderLegacyId = `${authUserId}`;
      if (!user.legacyId) {
        const now = Date.now();
        await ctx.db.patch(authUserId, {
          legacyId: placeholderLegacyId,
          email: args.email ?? user.email,
          updatedAt: now,
        });
      }

      const updated = await ctx.db.get("users", authUserId);
      return {
        userId: authUserId,
        legacyId: updated?.legacyId ?? placeholderLegacyId,
        email: updated?.email ?? args.email ?? `${placeholderLegacyId}@demo.mindtasker.local`,
        phoneVerified: updated?.phoneVerified ?? false,
      };
    }

    const canLinkLegacy =
      isSelfReferentialLegacyId(authUserId, user.legacyId) ||
      user.legacyId === args.legacyId;

    if (user.legacyId && user.legacyId !== args.legacyId && !canLinkLegacy) {
      throw new Error("Unauthorized");
    }

    if (!user.legacyId || isSelfReferentialLegacyId(authUserId, user.legacyId)) {
      const conflict = await ctx.db
        .query("users")
        .withIndex("by_legacy_id", (q) => q.eq("legacyId", args.legacyId))
        .unique();
      if (conflict && conflict._id !== authUserId) {
        throw new Error("Legacy account already linked to another user");
      }

      const now = Date.now();
      await ctx.db.patch(authUserId, {
        legacyId: args.legacyId,
        email: args.email ?? user.email,
        updatedAt: now,
      });
    }

    const updated = await ctx.db.get("users", authUserId);
    return {
      userId: authUserId,
      legacyId: updated?.legacyId ?? args.legacyId,
      email: updated?.email ?? args.email ?? `${args.legacyId}@demo.mindtasker.local`,
      phoneVerified: updated?.phoneVerified ?? false,
    };
  },
});

/** Attach Convex Auth subject when user signs in (future-ready). */
export const linkTokenIdentifier = mutation({
  args: {
    userId: v.id("users"),
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, { userId: requestedUserId, tokenIdentifier }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
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

/** One-time setup: attach email/phone to the demo legacy user so Password signup/login claims it. */
export const prepareRealUserAccount = internalMutation({
  args: {
    email: v.string(),
    phone: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
  },
  returns: v.object({
    userId: v.id("users"),
    email: v.string(),
    phone: v.string(),
  }),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const phone = normalizePhone(args.phone);
    const firstName = (args.firstName ?? "Erez").trim();
    const lastName = (args.lastName ?? "Babayan").trim();
    const name = [firstName, lastName].filter(Boolean).join(" ");
    const now = Date.now();
    const LEGACY_DEMO_ID = "00000000-0000-4000-8000-000000000001";

    const byEmail = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    const byLegacy = await ctx.db
      .query("users")
      .withIndex("by_legacy_id", (q) => q.eq("legacyId", LEGACY_DEMO_ID))
      .unique();
    const byPhone = await ctx.db
      .query("users")
      .withIndex("phone", (q) => q.eq("phone", phone))
      .unique();

    const user = byEmail ?? byLegacy ?? byPhone;
    if (user) {
      await ctx.db.patch(user._id, {
        email,
        phone,
        phoneVerified: true,
        firstName,
        lastName,
        name,
        legacyId: user.legacyId ?? LEGACY_DEMO_ID,
        updatedAt: now,
      });
      return { userId: user._id, email, phone };
    }

    const userId = await ctx.db.insert("users", {
      email,
      phone,
      phoneVerified: true,
      firstName,
      lastName,
      name,
      legacyId: LEGACY_DEMO_ID,
      tier: "free",
      allocatedAudioSeconds: 1800,
      usedAudioSeconds: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { userId, email, phone };
  },
});

/** Link a verified WhatsApp phone to a user (settings / onboarding). */
export const linkVerifiedPhone = mutation({
  args: {
    userId: v.id("users"),
    phone: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, { userId: requestedUserId, phone }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const normalized = normalizePhone(phone);
    const now = Date.now();

    const conflict = await ctx.db
      .query("users")
      .withIndex("phone", (q) => q.eq("phone", normalized))
      .unique();

    if (conflict && conflict._id !== userId) {
      throw new Error("מספר הטלפון כבר מקושר לחשבון אחר");
    }

    await ctx.db.patch(userId, {
      phone: normalized,
      phoneVerified: true,
      updatedAt: now,
    });

    // Free-tier stable path: default capture to Message Yourself when unset.
    const after = await ctx.db.get("users", userId);
    if (after && !after.whatsappCaptureGroupChatId?.trim()) {
      const digits = normalized.replace(/\D/g, "");
      await ctx.db.patch(userId, {
        whatsappCaptureGroupChatId: `${digits}@c.us`,
        whatsappCaptureGroupName: "הודעה לעצמי (BabiTk)",
        updatedAt: Date.now(),
      });
    }

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

    const allocated = user.allocatedAudioSeconds ?? DEFAULT_AUDIO_SECONDS;
    const used = user.usedAudioSeconds ?? 0;
    const remaining = allocated - used;
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
      usedAudioSeconds: (user.usedAudioSeconds ?? 0) + seconds,
      updatedAt: Date.now(),
    });
  },
});
