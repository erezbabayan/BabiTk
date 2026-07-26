import { getAuthSessionId, getAuthUserId, invalidateSessions, modifyAccountCredentials, retrieveAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action } from "./_generated/server";

const MIN_PASSWORD_LENGTH = 8;

export const changePassword = action({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    if (!args.newPassword || args.newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error("הסיסמה החדשה חייבת להכיל לפחות 8 תווים");
    }

    if (args.currentPassword === args.newPassword) {
      throw new Error("הסיסמה החדשה חייבת להיות שונה מהסיסמה הנוכחית");
    }

    const email = await ctx.runQuery(internal.users.getEmailInternal, { userId });
    if (!email) {
      throw new Error("לא נמצא אימייל לחשבון");
    }

    let account;
    try {
      account = await retrieveAccount(ctx, {
        provider: "password",
        account: { id: email, secret: args.currentPassword },
      });
    } catch {
      throw new Error("הסיסמה הנוכחית שגויה");
    }

    if (account === null) {
      throw new Error("לא נמצא חשבון סיסמה");
    }
    if (account.user._id !== userId) {
      throw new Error("Unauthorized");
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: email, secret: args.newPassword },
    });

    const sessionId = await getAuthSessionId(ctx);
    await invalidateSessions(ctx, {
      userId,
      except: sessionId ? [sessionId] : [],
    });

    return null;
  },
});
