import { v } from "convex/values";

import { mutation } from "./_generated/server";
import { requireAuthUserId } from "./lib/requireAuth";

export const register = mutation({
  args: {
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android"), v.literal("web")),
  },
  returns: v.id("pushTokens"),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const token = args.token.trim();
    if (token.length < 8) {
      throw new Error("Invalid push token");
    }

    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        userId,
        platform: args.platform,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("pushTokens", {
      userId,
      token,
      platform: args.platform,
      updatedAt: now,
    });
  },
});

export const unregister = mutation({
  args: {
    token: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token.trim()))
      .unique();
    if (existing && existing.userId === userId) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});
