import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

const DEMO_LEGACY_ID = "00000000-0000-4000-8000-000000000001";

const moveCounts = v.object({
  tasks: v.number(),
  notebooks: v.number(),
  taskLists: v.number(),
  taskListItems: v.number(),
  userTagDefinitions: v.number(),
});

/**
 * Move all board data from a legacy/demo Convex user to the Convex Auth account
 * that matches `email`. Used when a user registered with email/password but
 * their items still belong to the old demo legacy user row.
 */
export const restoreDataToAuthUser = internalMutation({
  args: {
    email: v.string(),
    sourceLegacyId: v.optional(v.string()),
    grantPremium: v.optional(v.boolean()),
    grantAdmin: v.optional(v.boolean()),
  },
  returns: v.object({
    targetUserId: v.id("users"),
    sourceUserId: v.id("users"),
    moved: moveCounts,
  }),
  handler: async (ctx, args) => {
    const sourceLegacyId = args.sourceLegacyId ?? DEMO_LEGACY_ID;
    const email = args.email.trim().toLowerCase();

    const sourceUser = await ctx.db
      .query("users")
      .withIndex("by_legacy_id", (q) => q.eq("legacyId", sourceLegacyId))
      .unique();
    if (!sourceUser) {
      throw new Error(`Source user not found for legacyId ${sourceLegacyId}`);
    }

    const targetUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (!targetUser) {
      throw new Error(`Target user not found for email ${email}`);
    }

    if (sourceUser._id === targetUser._id) {
      return {
        targetUserId: targetUser._id,
        sourceUserId: sourceUser._id,
        moved: {
          tasks: 0,
          notebooks: 0,
          taskLists: 0,
          taskListItems: 0,
          userTagDefinitions: 0,
        },
      };
    }

    const sourceUserId = sourceUser._id;
    const targetUserId = targetUser._id;
    const now = Date.now();
    const moved = {
      tasks: 0,
      notebooks: 0,
      taskLists: 0,
      taskListItems: 0,
      userTagDefinitions: 0,
    };

    async function reassignUserId<T extends { userId: Id<"users"> }>(
      table: "tasks" | "notebooks" | "taskLists" | "taskListItems" | "userTagDefinitions",
      counter: keyof typeof moved,
    ) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.eq("userId", sourceUserId))
        .collect();

      for (const row of rows) {
        await ctx.db.patch(row._id, { userId: targetUserId, updatedAt: now });
        moved[counter]++;
      }
    }

    await reassignUserId("tasks", "tasks");
    await reassignUserId("notebooks", "notebooks");
    await reassignUserId("taskLists", "taskLists");
    await reassignUserId("taskListItems", "taskListItems");
    await reassignUserId("userTagDefinitions", "userTagDefinitions");

    const tier =
      args.grantPremium === true
        ? "premium"
        : (sourceUser.tier ?? targetUser.tier ?? "free");
    const role =
      args.grantAdmin === true ? "admin" : (targetUser.role ?? sourceUser.role ?? "user");

    await ctx.db.patch(targetUserId, {
      email,
      legacyId: sourceLegacyId,
      phone: sourceUser.phone ?? targetUser.phone,
      phoneVerified: sourceUser.phoneVerified ?? targetUser.phoneVerified,
      tier,
      role,
      allocatedAudioSeconds:
        sourceUser.allocatedAudioSeconds ?? targetUser.allocatedAudioSeconds,
      usedAudioSeconds: sourceUser.usedAudioSeconds ?? targetUser.usedAudioSeconds,
      name: targetUser.name ?? sourceUser.name,
      image: targetUser.image ?? sourceUser.image,
      updatedAt: now,
    });

    await ctx.db.patch(sourceUserId, {
      phone: undefined,
      phoneVerified: false,
      updatedAt: now,
    });

    return {
      targetUserId,
      sourceUserId,
      moved,
    };
  },
});
