"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { sendGreenApiText } from "./lib/greenApiSend";
import { normalizePhone } from "./lib/phone";
import {
  PHONE_OTP_ERRORS,
  hashPhoneOtp,
  phoneOtpMessage,
  planOtpSend,
  randomSixDigitCode,
} from "./lib/phone_otp";

export const requestPhoneOtp = action({
  args: { phone: v.string() },
  returns: v.object({
    message: v.string(),
    alreadyVerified: v.optional(v.boolean()),
  }),
  handler: async (ctx, { phone }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("יש להתחבר מחדש");

    let normalized = "";
    try {
      normalized = normalizePhone(phone);
    } catch {
      throw new Error(PHONE_OTP_ERRORS.invalid_phone);
    }
    const digits = normalized.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) {
      throw new Error(PHONE_OTP_ERRORS.invalid_phone);
    }

    const state = await ctx.runQuery(internal.phoneOtp.loadState, { userId });
    if (state.phoneVerified && state.phone === normalized) {
      return { message: PHONE_OTP_ERRORS.already, alreadyVerified: true };
    }
    const taken = await ctx.runQuery(internal.phoneOtp.phoneTaken, {
      phone: normalized,
      userId: state.userId,
    });
    if (taken) throw new Error(PHONE_OTP_ERRORS.taken);

    const now = Date.now();
    const sentIso = state.sentAt.map((value: number) => new Date(value).toISOString());
    const plan = planOtpSend(sentIso, now);
    if (!plan.ok) throw new Error(PHONE_OTP_ERRORS.rate_limited);

    const creds = await ctx.runQuery(internal.whatsappConfig.getGreenApiCredentialsInternal, {});
    if (!creds) throw new Error(PHONE_OTP_ERRORS.no_gateway);

    const code = randomSixDigitCode();
    const hash = await hashPhoneOtp(code);
    const sentAt = plan.sentAt.map((iso) => Date.parse(iso));
    await ctx.runMutation(internal.phoneOtp.storeChallenge, {
      userId,
      phone: normalized,
      hash,
      expiresAt: Date.parse(plan.expiresAt),
      sentAt,
    });
    try {
      await sendGreenApiText(normalized, phoneOtpMessage(code), creds);
    } catch {
      await ctx.runMutation(internal.phoneOtp.restoreChallenge, {
        userId,
        pending: state.pending,
        hash: state.hash,
        expiresAt: state.expiresAt,
        attempts: state.attempts,
        sentAt: state.sentAt,
      });
      throw new Error(PHONE_OTP_ERRORS.send_failed);
    }
    return { message: "נשלח קוד אימות בן 6 ספרות לוואטסאפ. הקוד תקף ל-10 דקות." };
  },
});
