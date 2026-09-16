"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import type { GreenApiCredentials } from "./lib/greenApiSend";
import { logSecurityEvent } from "./lib/securityLog";
import { requireAdminAction } from "./lib/requireAdminAction";
import { normalizePhone } from "./lib/phone";

function digitsOnly(phone: string): string {
  return normalizePhone(phone).replace(/\D/g, "");
}

type WaSettings = {
  stateInstance?: string;
  phone?: string;
};

type RingCheckResult = {
  configured: boolean;
  stateInstance: string | null;
  senderPhone: string | null;
  recipientPhone: string | null;
  willRingOnWhatsApp: boolean;
  reason: string;
  fixHint: string;
  qrPageUrl: string | null;
};

type LogoutResult = {
  ok: boolean;
  reason?: string;
  qrPageUrl: string | null;
};

async function fetchWaSettings(creds: GreenApiCredentials): Promise<WaSettings> {
  const base = creds.baseUrl.replace(/\/$/, "");
  const url = `${base}/waInstance${creds.instanceId}/getWaSettings/${creds.token}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`getWaSettings failed: ${response.status}`);
  }
  return (await response.json()) as WaSettings;
}

function qrConsoleUrl(): string {
  return "https://console.green-api.com/";
}

/**
 * Why WhatsApp has no sound/popup: Green-API is linked to the same phone
 * that receives digests. WhatsApp suppresses notifications for self-sends.
 */
export const checkNotificationSound = action({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    stateInstance: v.union(v.string(), v.null()),
    senderPhone: v.union(v.string(), v.null()),
    recipientPhone: v.union(v.string(), v.null()),
    willRingOnWhatsApp: v.boolean(),
    reason: v.string(),
    fixHint: v.string(),
    qrPageUrl: v.union(v.string(), v.null()),
  }),
  handler: async (ctx): Promise<RingCheckResult> => {
    let userId: Id<"users">;
    try {
      userId = await requireAdminAction(ctx);
    } catch {
      return {
        configured: false,
        stateInstance: null,
        senderPhone: null,
        recipientPhone: null,
        willRingOnWhatsApp: false,
        reason: "not_authenticated",
        fixHint: "רק מנהל יכול לבדוק את חיבור השולח",
        qrPageUrl: null,
      };
    }

    const profile: { phone: string; phoneVerified: boolean; name: string | null } | null =
      await ctx.runQuery(internal.users.getPhoneInternal, { userId });
    const recipientDigits: string = profile?.phone ? digitsOnly(profile.phone) : "";

    const creds: GreenApiCredentials | null = await ctx.runQuery(
      internal.whatsappConfig.getGreenApiCredentialsInternal,
      {},
    );
    if (!creds) {
      return {
        configured: false,
        stateInstance: null,
        senderPhone: null,
        recipientPhone: recipientDigits ? `+${recipientDigits}` : null,
        willRingOnWhatsApp: false,
        reason: "green_api_not_configured",
        fixHint: "הגדר Green-API ואז חבר מספר שולח שונה ממספר הקבלה",
        qrPageUrl: null,
      };
    }

    const settings: WaSettings = await fetchWaSettings(creds);
    const senderDigits: string = settings.phone ? digitsOnly(settings.phone) : "";
    const same: boolean =
      senderDigits.length > 0 &&
      recipientDigits.length > 0 &&
      senderDigits === recipientDigits;
    const authorized: boolean = settings.stateInstance === "authorized";
    const willRing: boolean = authorized && Boolean(senderDigits) && !same;

    return {
      configured: true,
      stateInstance: settings.stateInstance ?? null,
      senderPhone: senderDigits ? `+${senderDigits}` : null,
      recipientPhone: recipientDigits ? `+${recipientDigits}` : null,
      willRingOnWhatsApp: willRing,
      reason: !authorized
        ? "not_authorized"
        : same
          ? "same_number_silent"
          : "ok",
      fixHint: same
        ? "נתק וסרוק QR עם מספר אחר (WhatsApp Business / SIM שני) — לא אותו מספר שמקבל"
        : !authorized
          ? "סרוק QR עם מספר השולח (שונה ממספר הקבלה)"
          : "השולח שונה מהמקבל — וואטסאפ אמור לצלצל",
      qrPageUrl: qrConsoleUrl(),
    };
  },
});

/** Logout Green-API so a different WhatsApp number can scan the QR. */
export const logoutForNewSender = action({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    reason: v.optional(v.string()),
    qrPageUrl: v.union(v.string(), v.null()),
  }),
  handler: async (ctx): Promise<LogoutResult> => {
    try {
      await requireAdminAction(ctx);
    } catch {
      return { ok: false, reason: "not_authenticated", qrPageUrl: null };
    }
    const creds: GreenApiCredentials | null = await ctx.runQuery(
      internal.whatsappConfig.getGreenApiCredentialsInternal,
      {},
    );
    if (!creds) {
      return { ok: false, reason: "green_api_not_configured", qrPageUrl: null };
    }
    const base: string = creds.baseUrl.replace(/\/$/, "");
    const url: string = `${base}/waInstance${creds.instanceId}/logout/${creds.token}`;
    const response: Response = await fetch(url);
    if (!response.ok) {
      logSecurityEvent("green_api_logout_failed", { status: response.status });
      return {
        ok: false,
        reason: "logout_failed",
        qrPageUrl: null,
      };
    }
    logSecurityEvent("green_api_logout", { ok: true });
    return {
      ok: true,
      qrPageUrl: qrConsoleUrl(),
    };
  },
});
