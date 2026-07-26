"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import type { WhatsAppSendResult } from "./lib/whatsappOutbound";

type TestSendResult = {
  ok: boolean;
  phone?: string;
  provider?: WhatsAppSendResult["provider"];
  reason?: string;
};

type UserPhoneProfile = {
  phone: string;
  phoneVerified: boolean;
  name: string | null;
};

export const sendTestToMe = action({
  args: {
    message: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    phone: v.optional(v.string()),
    provider: v.optional(
      v.union(
        v.literal("green-api"),
        v.literal("meta"),
        v.literal("callmebot"),
      ),
    ),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<TestSendResult> => {
    const userId: Id<"users"> | null = await getAuthUserId(ctx);
    if (!userId) {
      return { ok: false, reason: "not_authenticated" };
    }

    const profile: UserPhoneProfile | null = await ctx.runQuery(
      internal.users.getPhoneInternal,
      { userId },
    );
    if (!profile) {
      return { ok: false, reason: "phone_not_verified" };
    }

    const message =
      args.message?.trim() ||
      `✓ בדיקת BabaiTk\n\nשלום${profile.name ? ` ${profile.name}` : ""}, זו הודעת ניסיון.\nאם קיבלת — שליחת וואטסאפ עובדת.`;

    const result: WhatsAppSendResult = await ctx.runAction(
      internal.whatsappSend.sendReply,
      {
        toPhone: profile.phone,
        message,
      },
    );

    return {
      ok: result.sent,
      phone: profile.phone,
      provider: result.provider,
      reason: result.reason,
    };
  },
});
