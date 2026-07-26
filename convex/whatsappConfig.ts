import { v } from "convex/values";

import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { requireAuthUserId } from "./lib/requireAuth";

const SETTINGS_KEY = "default";
const DEFAULT_GREEN_URL = "https://api.greenapi.com";
const GREEN_CONSOLE_URL = "https://console.green-api.com/";

export type GreenApiCredentials = {
  instanceId: string;
  token: string;
  baseUrl: string;
};

function trimOrEmpty(value: string | undefined): string {
  return value?.trim() ?? "";
}

function resolveFromParts(
  instanceId: string | undefined,
  token: string | undefined,
  baseUrl: string | undefined,
): GreenApiCredentials | null {
  const id = trimOrEmpty(instanceId);
  const tok = trimOrEmpty(token);
  if (!id || !tok) return null;
  return {
    instanceId: id,
    token: tok,
    baseUrl: trimOrEmpty(baseUrl) || DEFAULT_GREEN_URL,
  };
}

async function getSettingsRow(ctx: QueryCtx) {
  return await ctx.db
    .query("appSettings")
    .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
    .unique();
}

export async function loadGreenApiCredentials(
  ctx: QueryCtx,
): Promise<GreenApiCredentials | null> {
  const row = await getSettingsRow(ctx);
  const fromDb = resolveFromParts(
    row?.greenApiInstanceId,
    row?.greenApiToken,
    row?.greenApiUrl,
  );
  if (fromDb) return fromDb;
  return resolveFromParts(
    process.env.GREEN_API_INSTANCE_ID,
    process.env.GREEN_API_TOKEN,
    process.env.GREEN_API_URL,
  );
}

export const getGreenApiCredentialsInternal = internalQuery({
  args: {},
  returns: v.union(
    v.object({
      instanceId: v.string(),
      token: v.string(),
      baseUrl: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    return await loadGreenApiCredentials(ctx);
  },
});

export const greenApiSetupStatus = query({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    hasStoredCredentials: v.boolean(),
    instanceId: v.union(v.string(), v.null()),
    consoleUrl: v.string(),
    setupSteps: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const row = await getSettingsRow(ctx);
    const creds = await loadGreenApiCredentials(ctx);
    return {
      configured: creds !== null,
      hasStoredCredentials: Boolean(
        row?.greenApiInstanceId?.trim() && row?.greenApiToken?.trim(),
      ),
      instanceId: creds?.instanceId ?? null,
      consoleUrl: GREEN_CONSOLE_URL,
      setupSteps: [
        "היכנס ל-console.green-api.com וצור instance (חינם)",
        "סרוק QR עם מספר שולח אחר — לא המספר שמקבל תזכורות (אחרת אין צליל)",
        "מומלץ: WhatsApp Business על SIM שני / טלפון נוסף",
        "העתק Instance ID ו-API Token",
        "הדבק כאן, שמור, ושלח הודעת בדיקה — אמורה לקפוץ עם צליל",
      ],
    };
  },
});

export const saveGreenApiCredentials = mutation({
  args: {
    instanceId: v.string(),
    token: v.string(),
    baseUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const instanceId = args.instanceId.trim();
    const token = args.token.trim();
    const baseUrl = trimOrEmpty(args.baseUrl) || DEFAULT_GREEN_URL;

    if (!/^\d+$/.test(instanceId)) {
      throw new Error("Instance ID חייב להיות מספר (מ-Green-API Console)");
    }
    if (token.length < 8) {
      throw new Error("API Token לא תקין");
    }

    const existing = await getSettingsRow(ctx);
    const patch = {
      key: SETTINGS_KEY,
      greenApiInstanceId: instanceId,
      greenApiToken: token,
      greenApiUrl: baseUrl,
      updatedAt: Date.now(),
      updatedBy: userId,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("appSettings", patch);
    }
    return null;
  },
});

export const clearGreenApiCredentials = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireAuthUserId(ctx);
    const existing = await getSettingsRow(ctx);
    if (!existing) return null;
    await ctx.db.patch(existing._id, {
      greenApiInstanceId: undefined,
      greenApiToken: undefined,
      greenApiUrl: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Ops/CLI: save Green-API without interactive auth. */
export const setGreenApiCredentialsInternal = internalMutation({
  args: {
    instanceId: v.string(),
    token: v.string(),
    baseUrl: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const instanceId = args.instanceId.trim();
    const token = args.token.trim();
    const baseUrl = trimOrEmpty(args.baseUrl) || DEFAULT_GREEN_URL;
    if (!/^\d+$/.test(instanceId)) {
      return { ok: false, reason: "invalid_instance_id" };
    }
    if (token.length < 8) {
      return { ok: false, reason: "invalid_token" };
    }
    const existing = await getSettingsRow(ctx);
    const patch = {
      key: SETTINGS_KEY,
      greenApiInstanceId: instanceId,
      greenApiToken: token,
      greenApiUrl: baseUrl,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("appSettings", patch);
    }
    return { ok: true };
  },
});
