"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  markGreenApiMessageRead,
  type GreenApiCredentials,
} from "./lib/greenApiSend";
import {
  getWhatsAppSendStatus,
  sendWhatsAppText,
  type WhatsAppSendResult,
} from "./lib/whatsappOutbound";

export const sendReply = internalAction({
  args: {
    toPhone: v.string(),
    message: v.string(),
    chatId: v.optional(v.string()),
    /** Keep reply in the inbound chat (skip CallMeBot). */
    sameChat: v.optional(v.boolean()),
  },
  returns: v.object({
    sent: v.boolean(),
    provider: v.optional(
      v.union(
        v.literal("green-api"),
        v.literal("meta"),
        v.literal("callmebot"),
      ),
    ),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, { toPhone, message, chatId, sameChat }): Promise<WhatsAppSendResult> => {
    // Hard gate: never outbound-text a number that is not a verified linked user.
    const linked = await ctx.runQuery(internal.whatsappWebhook.findVerifiedByPhone, {
      phone: toPhone,
    });
    if (!linked) {
      return { sent: false, reason: "recipient_not_linked" };
    }

    const [callMeBotApiKey, greenApiCredentials] = await Promise.all([
      ctx.runQuery(internal.users.getCallMeBotKeyByPhone, { phone: toPhone }),
      ctx.runQuery(internal.whatsappConfig.getGreenApiCredentialsInternal, {}),
    ]);
    return await sendWhatsAppText(toPhone, message, {
      callMeBotApiKey,
      greenApiCredentials,
      chatId,
      sameChat: sameChat === true,
    });
  },
});

/** Mark inbound chat message as read (WhatsApp double blue ticks). */
export const markRead = internalAction({
  args: {
    chatId: v.string(),
    messageId: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
  }),
  handler: async (ctx, { chatId, messageId }): Promise<{ ok: boolean }> => {
    const greenApiCredentials: GreenApiCredentials | null = await ctx.runQuery(
      internal.whatsappConfig.getGreenApiCredentialsInternal,
      {},
    );
    const ok = await markGreenApiMessageRead(chatId, messageId, greenApiCredentials);
    return { ok };
  },
});

/** CLI / ops: report whether outbound WhatsApp is actually usable. */
export const sendStatus = internalAction({
  args: {},
  returns: v.object({
    provider: v.union(
      v.literal("green-api"),
      v.literal("meta"),
      v.literal("callmebot"),
      v.literal("none"),
    ),
    configured: v.boolean(),
    greenConfigured: v.boolean(),
    metaConfigured: v.boolean(),
    hint: v.string(),
  }),
  handler: async (ctx): Promise<{
    provider: "green-api" | "meta" | "callmebot" | "none";
    configured: boolean;
    greenConfigured: boolean;
    metaConfigured: boolean;
    hint: string;
  }> => {
    const greenApiCredentials: {
      instanceId: string;
      token: string;
      baseUrl: string;
    } | null = await ctx.runQuery(
      internal.whatsappConfig.getGreenApiCredentialsInternal,
      {},
    );
    return getWhatsAppSendStatus({
      greenConfigured: greenApiCredentials !== null,
    });
  },
});
