"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { GreenApiCredentials } from "./lib/greenApiSend";

type SetSettingsResult = {
  ok: boolean;
  webhookUrl: string | null;
  reason?: string;
  saveSettings?: unknown;
};

/**
 * Point Green-API instance at our Convex webhook and enable
 * incoming + phone-outgoing events (for Message Yourself capture).
 */
export const configureGreenApiWebhooks = internalAction({
  args: {
    webhookUrl: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    webhookUrl: v.union(v.string(), v.null()),
    reason: v.optional(v.string()),
    saveSettings: v.optional(v.any()),
  }),
  handler: async (ctx, args): Promise<SetSettingsResult> => {
    const creds: GreenApiCredentials | null = await ctx.runQuery(
      internal.whatsappConfig.getGreenApiCredentialsInternal,
      {},
    );
    if (!creds) {
      return { ok: false, webhookUrl: null, reason: "green_api_not_configured" };
    }

    const site = (process.env.CONVEX_SITE_URL ?? "").replace(/\/$/, "");
    const webhookUrl =
      args.webhookUrl?.trim() ||
      (site ? `${site}/webhook/green-api` : "");
    if (!webhookUrl) {
      return { ok: false, webhookUrl: null, reason: "missing_convex_site_url" };
    }

    const base = creds.baseUrl.replace(/\/$/, "");
    const url = `${base}/waInstance${creds.instanceId}/setSettings/${creds.token}`;
    const body = {
      webhookUrl,
      incomingWebhook: "yes",
      outgoingWebhook: "yes",
      outgoingMessageWebhook: "yes",
      // Required for backfill: lastOutgoingMessages uses stored history.
      // Without it, `backfillRecentOutgoingCapture` can't find new outgoing messages.
      enableMessagesHistory: "yes",
      // Digests/API sends must NOT loop back into ingest.
      outgoingAPIMessageWebhook: "no",
      stateWebhook: "yes",
      keepOnlineStatus: "yes",
      markIncomingMessagesReaded: "no",
      markIncomingMessagesReadedOnReply: "no",
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await response.text().catch(() => "");
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep raw
    }

    if (!response.ok) {
      return {
        ok: false,
        webhookUrl,
        reason: `setSettings_failed:${response.status}:${text.slice(0, 200)}`,
        saveSettings: parsed,
      };
    }

    return {
      ok: true,
      webhookUrl,
      saveSettings: parsed,
    };
  },
});
