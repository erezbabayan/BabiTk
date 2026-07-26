import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { loadGreenApiCredentials } from "./whatsappConfig";
import { normalizePhone } from "./lib/phone";
import { sendViaCallMeBot } from "./lib/whatsappOutbound";

type WhatsAppSetupSnapshot = {
  found: boolean;
  phone?: string | null;
  captureGroupChatId: string | null;
};

type GreenApiSnapshot = {
  stateInstance: string | null;
  authorized: boolean;
  restricted?: boolean;
  yellowCardUntil?: string | null;
  hint: string;
};

type DiagnoseOutboundResult = {
  found: boolean;
  phone: string | null;
  captureGroupChatId: string | null;
  hasCallMeBotKey: boolean;
  callMeBotKeyLen: number;
  callMeBotOk: boolean;
  callMeBotDetail: string | null;
  greenState: string | null;
  greenAuthorized: boolean;
  hint: string;
};

/** Ops: count push tokens / notify prefs for a user by email. */
export const inspectPushSetup = internalQuery({
  args: {
    email: v.optional(v.string()),
  },
  returns: v.object({
    found: v.boolean(),
    userId: v.optional(v.id("users")),
    name: v.optional(v.union(v.string(), v.null())),
    notifyInApp: v.optional(v.boolean()),
    notifyWhatsApp: v.optional(v.boolean()),
    tokenCount: v.number(),
    tokens: v.array(
      v.object({
        platform: v.union(v.literal("ios"), v.literal("android"), v.literal("web")),
        tokenPrefix: v.string(),
        updatedAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const email = (args.email ?? "erezbabayan@gmail.com").trim().toLowerCase();
    const users = await ctx.db.query("users").take(500);
    const user = users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (!user) {
      return { found: false, tokenCount: 0, tokens: [] };
    }
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    return {
      found: true,
      userId: user._id,
      name: user.name ?? null,
      notifyInApp: user.notifyInApp !== false,
      notifyWhatsApp: user.notifyWhatsApp !== false,
      tokenCount: tokens.length,
      tokens: tokens.map((t) => ({
        platform: t.platform,
        tokenPrefix: `${t.token.slice(0, 28)}…`,
        updatedAt: t.updatedAt,
      })),
    };
  },
});

/**
 * Ops: patch digest day/hour prefs by email (no client auth).
 * Example: npx convex run internal.whatsappOps.patchDigestPrefs '{}'
 */
export const patchDigestPrefs = internalMutation({
  args: {
    email: v.optional(v.string()),
    whatsappDigestDays: v.optional(
      v.union(v.literal("weekdays"), v.literal("everyday")),
    ),
    /** Clear legacy single-hour field when multi-hour list is the source of truth. */
    clearLegacyDigestHour: v.optional(v.boolean()),
  },
  returns: v.object({
    ok: v.boolean(),
    reason: v.optional(v.string()),
    before: v.optional(
      v.object({
        whatsappDigestDays: v.union(
          v.literal("weekdays"),
          v.literal("everyday"),
          v.null(),
        ),
        whatsappDigestHour: v.union(v.number(), v.null()),
        whatsappDigestHours: v.array(v.number()),
      }),
    ),
    after: v.optional(
      v.object({
        whatsappDigestDays: v.union(
          v.literal("weekdays"),
          v.literal("everyday"),
          v.null(),
        ),
        whatsappDigestHour: v.union(v.number(), v.null()),
        whatsappDigestHours: v.array(v.number()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const email = (args.email ?? "erezbabayan@gmail.com").trim().toLowerCase();
    const users = await ctx.db.query("users").take(500);
    const user = users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (!user) {
      return { ok: false, reason: "user_not_found" };
    }

    const before = {
      whatsappDigestDays:
        user.whatsappDigestDays === "weekdays" ||
        user.whatsappDigestDays === "everyday"
          ? user.whatsappDigestDays
          : null,
      whatsappDigestHour:
        typeof user.whatsappDigestHour === "number"
          ? user.whatsappDigestHour
          : null,
      whatsappDigestHours: user.whatsappDigestHours ?? [],
    };

    const patch: {
      whatsappDigestDays?: "weekdays" | "everyday";
      whatsappDigestHour?: undefined;
    } = {};
    if (args.whatsappDigestDays !== undefined) {
      patch.whatsappDigestDays = args.whatsappDigestDays;
    }
    if (args.clearLegacyDigestHour === true) {
      patch.whatsappDigestHour = undefined;
    }
    if (Object.keys(patch).length === 0) {
      return { ok: false, reason: "no_changes", before };
    }

    await ctx.db.patch(user._id, patch);
    const updated = await ctx.db.get(user._id);
    return {
      ok: true,
      before,
      after: {
        whatsappDigestDays:
          updated?.whatsappDigestDays === "weekdays" ||
          updated?.whatsappDigestDays === "everyday"
            ? updated.whatsappDigestDays
            : null,
        whatsappDigestHour:
          typeof updated?.whatsappDigestHour === "number"
            ? updated.whatsappDigestHour
            : null,
        whatsappDigestHours: updated?.whatsappDigestHours ?? [],
      },
    };
  },
});

/** Ops: inspect WhatsApp outbound readiness for a user. */
export const inspectWhatsAppSetup = internalQuery({
  args: {
    email: v.optional(v.string()),
  },
  returns: v.object({
    found: v.boolean(),
    name: v.optional(v.union(v.string(), v.null())),
    phone: v.optional(v.union(v.string(), v.null())),
    phoneVerified: v.optional(v.boolean()),
    notifyWhatsApp: v.optional(v.boolean()),
    hasCallMeBotKey: v.boolean(),
    greenConfigured: v.boolean(),
    greenInstanceId: v.union(v.string(), v.null()),
    digestHours: v.array(v.number()),
    digestDays: v.union(v.literal("weekdays"), v.literal("everyday"), v.null()),
    lastDigestSlots: v.array(v.string()),
    lastDigestDate: v.union(v.string(), v.null()),
    captureGroupChatId: v.union(v.string(), v.null()),
    captureGroupName: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const email = (args.email ?? "erezbabayan@gmail.com").trim().toLowerCase();
    const users = await ctx.db.query("users").take(500);
    const user = users.find((u) => (u.email ?? "").toLowerCase() === email);
    const creds = await loadGreenApiCredentials(ctx);
    if (!user) {
      return {
        found: false,
        hasCallMeBotKey: false,
        greenConfigured: creds !== null,
        greenInstanceId: creds?.instanceId ?? null,
        digestHours: [],
        digestDays: null,
        lastDigestSlots: [],
        lastDigestDate: null,
        captureGroupChatId: null,
        captureGroupName: null,
      };
    }
    const hours = user.whatsappDigestHours?.length
      ? user.whatsappDigestHours
      : user.whatsappDigestHour !== undefined
        ? [user.whatsappDigestHour]
        : [9];
    return {
      found: true,
      name: user.name ?? null,
      phone: user.phone ? normalizePhone(user.phone) : null,
      phoneVerified: user.phoneVerified === true,
      notifyWhatsApp: user.notifyWhatsApp !== false,
      hasCallMeBotKey: Boolean(user.callMeBotApiKey?.trim()),
      greenConfigured: creds !== null,
      greenInstanceId: creds?.instanceId ?? null,
      digestHours: hours,
      digestDays:
        user.whatsappDigestDays === "weekdays" ||
        user.whatsappDigestDays === "everyday"
          ? user.whatsappDigestDays
          : null,
      lastDigestSlots: user.lastWhatsAppDigestSlots ?? [],
      lastDigestDate: user.lastWhatsAppDigestDate ?? null,
      captureGroupChatId: user.whatsappCaptureGroupChatId ?? null,
      captureGroupName: user.whatsappCaptureGroupName ?? null,
    };
  },
});

/** Ops: is Green-API authorized? (notAuthorized = no capture / no real WA send). */
export const checkGreenApiConnection = internalAction({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    stateInstance: v.union(v.string(), v.null()),
    phone: v.union(v.string(), v.null()),
    authorized: v.boolean(),
    restricted: v.boolean(),
    yellowCardUntil: v.union(v.string(), v.null()),
    webhookUrl: v.union(v.string(), v.null()),
    qrPageUrl: v.union(v.string(), v.null()),
    hint: v.string(),
  }),
  handler: async (ctx): Promise<{
    configured: boolean;
    stateInstance: string | null;
    phone: string | null;
    authorized: boolean;
    restricted: boolean;
    yellowCardUntil: string | null;
    webhookUrl: string | null;
    qrPageUrl: string | null;
    hint: string;
  }> => {
    const creds: {
      instanceId: string;
      token: string;
      baseUrl: string;
    } | null = await ctx.runQuery(
      internal.whatsappConfig.getGreenApiCredentialsInternal,
      {},
    );
    if (!creds) {
      return {
        configured: false,
        stateInstance: null,
        phone: null,
        authorized: false,
        restricted: false,
        yellowCardUntil: null,
        webhookUrl: null,
        qrPageUrl: null,
        hint: "חסרים מפתחות Green-API",
      };
    }
    const base = creds.baseUrl.replace(/\/$/, "");
    const qrPageUrl: string = `https://qr.green-api.com/waInstance${creds.instanceId}/${creds.token}`;
    try {
      const [stateRes, waRes, settingsRes] = await Promise.all([
        fetch(`${base}/waInstance${creds.instanceId}/getStateInstance/${creds.token}`),
        fetch(`${base}/waInstance${creds.instanceId}/getWaSettings/${creds.token}`),
        fetch(`${base}/waInstance${creds.instanceId}/getSettings/${creds.token}`),
      ]);
      const state = (await stateRes.json().catch(() => ({}))) as {
        stateInstance?: string;
      };
      const wa = (await waRes.json().catch(() => ({}))) as {
        phone?: string;
        yellowCardUntil?: number;
      };
      const settings = (await settingsRes.json().catch(() => ({}))) as {
        webhookUrl?: string;
      };
      const stateInstance = state.stateInstance ?? null;
      // yellowCard: outbound send blocked; webhooks often drop. Capture continues
      // via getChatHistory + receiveNotification drain (cron every minute).
      const yellowCard = stateInstance === "yellowCard";
      const captureReady =
        stateInstance === "authorized" || yellowCard;
      const authorized = captureReady;
      const restricted =
        stateInstance === "suspended" || stateInstance === "blocked";
      const yellowCardUntil =
        typeof wa.yellowCardUntil === "number" && wa.yellowCardUntil > 0
          ? new Date(wa.yellowCardUntil * 1000).toISOString()
          : null;
      const yellowUntilLabel =
        yellowCard && yellowCardUntil
          ? new Date(yellowCardUntil).toLocaleString("he-IL", {
              timeZone: "Asia/Jerusalem",
            })
          : null;
      return {
        configured: true,
        stateInstance,
        phone: wa.phone
          ? normalizePhone(`+${String(wa.phone).replace(/\D/g, "")}`)
          : null,
        authorized,
        restricted,
        yellowCardUntil: yellowCard ? yellowCardUntil : null,
        webhookUrl: settings.webhookUrl ?? null,
        qrPageUrl,
        hint: yellowCard
          ? `Green-API ב־yellowCard עד ${yellowUntilLabel ?? "שחרור החסימה"} — webhook עלול לא להגיע מיד; הקליטה ממשיכה דרך סנכרון היסטוריה (עד כדקה). שליחת תזכורות לקבוצה חסומה עד אז.`
          : captureReady
            ? "מחובר — שלחו הודעות לקבוצת הקליטה (קליטה פעילה)."
            : restricted
              ? `WhatsApp חסם את המספר (${stateInstance}). סרקו QR מחדש או אתחלו את ה-instance.`
              : "Green-API לא מחובר במלואו. סרוק QR בקונסולת Green-API.",
      };
    } catch (error) {
      return {
        configured: true,
        stateInstance: null,
        phone: null,
        authorized: false,
        restricted: false,
        yellowCardUntil: null,
        webhookUrl: null,
        qrPageUrl,
        hint:
          error instanceof Error
            ? error.message
            : "failed_to_check_green_api",
      };
    }
  },
});

/**
 * Ops: probe CallMeBot + capture binding for a user (surfaces real send errors).
 * npx convex run whatsappOps:diagnoseOutbound '{"email":"erezbabayan@gmail.com"}'
 */
export const diagnoseOutbound = internalAction({
  args: {
    email: v.optional(v.string()),
  },
  returns: v.object({
    found: v.boolean(),
    phone: v.union(v.string(), v.null()),
    captureGroupChatId: v.union(v.string(), v.null()),
    hasCallMeBotKey: v.boolean(),
    callMeBotKeyLen: v.number(),
    callMeBotOk: v.boolean(),
    callMeBotDetail: v.union(v.string(), v.null()),
    greenState: v.union(v.string(), v.null()),
    greenAuthorized: v.boolean(),
    hint: v.string(),
  }),
  handler: async (ctx, args): Promise<DiagnoseOutboundResult> => {
    const email = (args.email ?? "erezbabayan@gmail.com").trim().toLowerCase();
    const setup: WhatsAppSetupSnapshot = await ctx.runQuery(internal.whatsappOps.inspectWhatsAppSetup, {
      email,
    });
    const green: GreenApiSnapshot = await ctx.runAction(
      internal.whatsappOps.checkGreenApiConnection,
      {},
    );

    if (!setup.found || !setup.phone) {
      return {
        found: false,
        phone: null,
        captureGroupChatId: null,
        hasCallMeBotKey: false,
        callMeBotKeyLen: 0,
        callMeBotOk: false,
        callMeBotDetail: null,
        greenState: green.stateInstance,
        greenAuthorized: green.authorized,
        hint: "משתמש לא נמצא או בלי טלפון מאומת",
      };
    }

    const key: string | null = await ctx.runQuery(internal.users.getCallMeBotKeyByPhone, {
      phone: setup.phone,
    });
    let callMeBotOk = false;
    let callMeBotDetail: string | null = null;
    if (key) {
      try {
        await sendViaCallMeBot(
          setup.phone,
          "✓ בדיקת CallMeBot מ־BabaiTk — אם קיבלת, הצליל עובד.",
          key,
        );
        callMeBotOk = true;
        callMeBotDetail = "sent";
      } catch (error) {
        callMeBotDetail =
          error instanceof Error ? error.message.slice(0, 300) : "callmebot_failed";
      }
    } else {
      callMeBotDetail = "missing_key";
    }

    const hint = callMeBotOk
      ? "CallMeBot עובד — תזכורות יומיות אמורות להגיע עם צליל."
      : setup.captureGroupChatId?.endsWith("@c.us")
        ? "קליטה דרך «הודעה לעצמי» מוכנה. לתזכורות עם צליל: חדש APIKEY מ־CallMeBot בהגדרות."
        : "קשר קליטה + חדש APIKEY מ־CallMeBot. סרוק QR ל־Green אם צריך קבוצות.";

    return {
      found: true,
      phone: setup.phone,
      captureGroupChatId: setup.captureGroupChatId,
      hasCallMeBotKey: Boolean(key),
      callMeBotKeyLen: key?.length ?? 0,
      callMeBotOk,
      callMeBotDetail,
      greenState: green.stateInstance,
      greenAuthorized: green.authorized,
      hint,
    };
  },
});

const greenConnectionStatusValidator = v.object({
  configured: v.boolean(),
  stateInstance: v.union(v.string(), v.null()),
  phone: v.union(v.string(), v.null()),
  authorized: v.boolean(),
  restricted: v.boolean(),
  yellowCardUntil: v.union(v.string(), v.null()),
  webhookUrl: v.union(v.string(), v.null()),
  qrPageUrl: v.union(v.string(), v.null()),
  hint: v.string(),
});

/** Ops: reboot Green-API instance to refresh history sync (safe under yellowCard). */
export const rebootGreenApiInstance = internalAction({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    stateBefore: v.union(v.string(), v.null()),
    stateAfter: v.union(v.string(), v.null()),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx): Promise<{
    ok: boolean;
    stateBefore: string | null;
    stateAfter: string | null;
    reason?: string;
  }> => {
    const creds: {
      instanceId: string;
      token: string;
      baseUrl: string;
    } | null = await ctx.runQuery(
      internal.whatsappConfig.getGreenApiCredentialsInternal,
      {},
    );
    if (!creds) {
      return { ok: false, stateBefore: null, stateAfter: null, reason: "not_configured" };
    }
    const base = creds.baseUrl.replace(/\/$/, "");
    let stateBefore: string | null = null;
    try {
      const beforeRes = await fetch(
        `${base}/waInstance${creds.instanceId}/getStateInstance/${creds.token}`,
      );
      const before = (await beforeRes.json().catch(() => ({}))) as {
        stateInstance?: string;
      };
      stateBefore = before.stateInstance ?? null;
    } catch {
      // continue
    }

    try {
      const rebootRes = await fetch(
        `${base}/waInstance${creds.instanceId}/reboot/${creds.token}`,
      );
      if (!rebootRes.ok) {
        const body = await rebootRes.text().catch(() => "");
        return {
          ok: false,
          stateBefore,
          stateAfter: null,
          reason: `reboot_http_${rebootRes.status}:${body.slice(0, 120)}`,
        };
      }
    } catch (error) {
      return {
        ok: false,
        stateBefore,
        stateAfter: null,
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    // Give Green-API a moment to come back.
    await new Promise((resolve) => setTimeout(resolve, 4000));
    let stateAfter: string | null = null;
    try {
      const afterRes = await fetch(
        `${base}/waInstance${creds.instanceId}/getStateInstance/${creds.token}`,
      );
      const after = (await afterRes.json().catch(() => ({}))) as {
        stateInstance?: string;
      };
      stateAfter = after.stateInstance ?? null;
    } catch {
      // ignore
    }

    // Kick capture recovery after reboot (history sync often resumes).
    await ctx.scheduler.runAfter(
      0,
      internal.whatsappCaptureBackfill.backfillRecentOutgoingCapture,
      { minutes: 48 * 60 },
    );

    return { ok: true, stateBefore, stateAfter };
  },
});

/** Client: live Green-API / WhatsApp restriction status for capture UI. */
export const getLiveConnectionStatus = action({
  args: {},
  returns: greenConnectionStatusValidator,
  handler: async (ctx): Promise<{
    configured: boolean;
    stateInstance: string | null;
    phone: string | null;
    authorized: boolean;
    restricted: boolean;
    yellowCardUntil: string | null;
    webhookUrl: string | null;
    qrPageUrl: string | null;
    hint: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    return await ctx.runAction(internal.whatsappOps.checkGreenApiConnection, {});
  },
});
