import { v } from "convex/values";
import { createAccount, modifyAccountCredentials, retrieveAccount } from "@convex-dev/auth/server";

import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";

const MIN_PASSWORD_LENGTH = 8;

/** Remove a password auth account so the user can register again. */
export const resetPasswordAccountByEmail = internalMutation({
  args: { email: v.string() },
  returns: v.object({
    removedAccount: v.boolean(),
    removedUser: v.boolean(),
    userId: v.union(v.id("users"), v.null()),
  }),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const account = await ctx.db
      .query("authAccounts")
      .filter((q) =>
        q.and(
          q.eq(q.field("provider"), "password"),
          q.eq(q.field("providerAccountId"), email),
        ),
      )
      .first();

    if (!account) {
      return { removedAccount: false, removedUser: false, userId: null };
    }

    const userId = account.userId;
    await ctx.db.delete("authAccounts", account._id);

    const sessions = await ctx.db
      .query("authSessions")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete("authSessions", session._id);
    }

    const user = await ctx.db.get("users", userId);
    let removedUser = false;
    if (user && user.legacyId === `${userId}`) {
      await ctx.db.delete("users", userId);
      removedUser = true;
    }

    return { removedAccount: true, removedUser, userId: removedUser ? null : userId };
  },
});

/** Dev/admin recovery — set a new password when the user forgot theirs. */
export const setPasswordByEmail = internalAction({
  args: {
    email: v.string(),
    password: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!email.includes("@")) {
      throw new Error("Invalid email");
    }
    if (args.password.length < MIN_PASSWORD_LENGTH) {
      throw new Error("Password must be at least 8 characters");
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
    });
    return null;
  },
});

/**
 * Create a password login for an existing Convex user row (legacy/demo profiles
 * often exist without an authAccounts password record).
 */
export const provisionPasswordAccount = internalAction({
  args: {
    email: v.string(),
    password: v.string(),
    grantPremium: v.optional(v.boolean()),
    grantAdmin: v.optional(v.boolean()),
  },
  returns: v.object({
    userId: v.id("users"),
    createdAccount: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!email.includes("@")) {
      throw new Error("Invalid email");
    }
    if (args.password.length < MIN_PASSWORD_LENGTH) {
      throw new Error("Password must be at least 8 characters");
    }

    let existingAccount: Awaited<ReturnType<typeof retrieveAccount>> | null = null;
    try {
      existingAccount = await retrieveAccount(ctx, {
        provider: "password",
        account: { id: email },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("InvalidAccountId")) {
        throw error;
      }
    }

    if (existingAccount) {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: email, secret: args.password },
      });
      return {
        userId: existingAccount.user._id,
        createdAccount: false,
      };
    }

    const created = await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: { email },
      shouldLinkViaEmail: true,
    });

    if (args.grantPremium === true || args.grantAdmin === true) {
      await ctx.runMutation(internal.authMaintenance.patchUserAccess, {
        userId: created.user._id,
        tier: args.grantPremium === true ? "premium" : undefined,
        role: args.grantAdmin === true ? "admin" : undefined,
      });
    }

    return {
      userId: created.user._id,
      createdAccount: true,
    };
  },
});

export const patchUserAccess = internalMutation({
  args: {
    userId: v.id("users"),
    tier: v.optional(v.union(v.literal("free"), v.literal("premium"))),
    role: v.optional(v.union(v.literal("admin"), v.literal("user"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.tier !== undefined) patch.tier = args.tier;
    if (args.role !== undefined) patch.role = args.role;
    await ctx.db.patch("users", args.userId, patch);
    return null;
  },
});
