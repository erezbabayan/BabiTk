"use node";

import { v } from "convex/values";

import { internalAction } from "./_generated/server";
import { isGreenApiSendConfigured, sendGreenApiText } from "./lib/greenApiSend";

export const sendReply = internalAction({
  args: {
    toPhone: v.string(),
    message: v.string(),
  },
  handler: async (_ctx, { toPhone, message }) => {
    if (!isGreenApiSendConfigured()) {
      return { sent: false, reason: "green_api_send_not_configured" };
    }

    try {
      await sendGreenApiText(toPhone, message);
      return { sent: true };
    } catch (error) {
      return {
        sent: false,
        reason: error instanceof Error ? error.message : "send_failed",
      };
    }
  },
});
