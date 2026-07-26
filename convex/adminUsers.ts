import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireAdminUser } from "./lib/adminAuth";
import { writeAuditLog } from "./lib/auditLog";
import { userTier } from "./validators";

const DEFAULT_AUDIO_SECONDS = 1800;
const MAX_LIST_USERS = 200;

const userRole = v.union(v.literal("admin"), v.literal("user"));

const userListItem = v.object({
  userId: v.id("users"),
  email: v.union(v.string(), v.null()),
  name: v.union(v.string(), v.null()),
  firstName: v.union(v.string(), v.null()),
  lastName: v.union(v.string(), v.null()),
  tier: userTier,
  role: userRole,
  phone: v.union(v.string(), v.null()),
  phoneVerified: v.boolean(),
  legacyId: v.union(v.string(), v.null()),
  createdAt: v.union(v.number(), v.null()),
  allocatedAudioSeconds: v.number(),
  usedAudioSeconds: v.number(),
});

const userStats = v.object({
  tasks: v.number(),
  notebooks: v.number(),
  taskLists: v.number(),
  activeTasks: v.number(),
});

const auditLogItem = v.object({
  id: v.id("auditLogs"),
  actorUserId: v.id("users"),
  actorEmail: v.union(v.string(), v.null()),
  targetUserId: v.union(v.id("users"), v.null()),
  targetEmail: v.union(v.string(), v.null()),
  action: v.string(),
  details: v.optional(v.any()),
  createdAt: v.number(),
});

function toUserListItem(user: {
  _id: Id<"users">;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  tier?: "free" | "premium";
  role?: "admin" | "user";
  phone?: string;
  phoneVerified?: boolean;
  legacyId?: string;
  createdAt?: number;
  allocatedAudioSeconds?: number;
  usedAudioSeconds?: number;
}) {
  return {
    userId: user._id,
    email: user.email ?? null,
    name: user.name ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    tier: user.tier ?? "free",
    role: user.role ?? "user",
    phone: user.phone ?? null,
    phoneVerified: user.phoneVerified ?? false,
    legacyId: user.legacyId ?? null,
    createdAt: user.createdAt ?? null,
    allocatedAudioSeconds: user.allocatedAudioSeconds ?? DEFAULT_AUDIO_SECONDS,
    usedAudioSeconds: user.usedAudioSeconds ?? 0,
  };
}

async function countUserRows(ctx: QueryCtx, userId: Id<"users">) {
  const [tasks, notebooks, taskLists] = await Promise.all([
    ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("notebooks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("taskLists")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  ]);

  const activeTasks = tasks.filter((row) => row.deletedAt === null).length;

  return {
    tasks: tasks.length,
    notebooks: notebooks.length,
    taskLists: taskLists.length,
    activeTasks,
  };
}

/** List users for the admin panel (search by email substring). */
export const list = query({
  args: {
    search: v.optional(v.string()),
  },
  returns: v.object({
    users: v.array(userListItem),
    total: v.number(),
  }),
  handler: async (ctx, { search }) => {
    await requireAdminUser(ctx);

    const needle = search?.trim().toLowerCase() ?? "";
    const allUsers = await ctx.db.query("users").order("desc").take(MAX_LIST_USERS);

    const filtered = needle
      ? allUsers.filter((user) => {
          const email = user.email?.toLowerCase() ?? "";
          const name = user.name?.toLowerCase() ?? "";
          const firstName = user.firstName?.toLowerCase() ?? "";
          const lastName = user.lastName?.toLowerCase() ?? "";
          const phone = user.phone?.toLowerCase() ?? "";
          const legacyId = user.legacyId?.toLowerCase() ?? "";
          return (
            email.includes(needle) ||
            name.includes(needle) ||
            firstName.includes(needle) ||
            lastName.includes(needle) ||
            phone.includes(needle) ||
            legacyId.includes(needle)
          );
        })
      : allUsers;

    return {
      users: filtered.map(toUserListItem),
      total: filtered.length,
    };
  },
});

/** Full user profile + usage stats for admin detail view. */
export const getDetails = query({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      user: userListItem,
      stats: userStats,
    }),
    v.null(),
  ),
  handler: async (ctx, { userId }) => {
    await requireAdminUser(ctx);

    const user = await ctx.db.get("users", userId);
    if (!user) return null;

    const stats = await countUserRows(ctx, userId);
    return {
      user: toUserListItem(user),
      stats,
    };
  },
});

/** Recent admin audit log entries. */
export const listAuditLogs = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(auditLogItem),
  handler: async (ctx, { limit = 30 }) => {
    await requireAdminUser(ctx);

    const capped = Math.min(Math.max(limit, 1), 100);
    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_created")
      .order("desc")
      .take(capped);

    const result = [];
    for (const row of rows) {
      const actor = await ctx.db.get("users", row.actorUserId);
      const target = row.targetUserId ? await ctx.db.get("users", row.targetUserId) : null;
      result.push({
        id: row._id,
        actorUserId: row.actorUserId,
        actorEmail: actor?.email ?? null,
        targetUserId: row.targetUserId ?? null,
        targetEmail: target?.email ?? null,
        action: row.action,
        details: row.details,
        createdAt: row.createdAt,
      });
    }

    return result;
  },
});

export const setTier = mutation({
  args: {
    userId: v.id("users"),
    tier: userTier,
  },
  returns: v.null(),
  handler: async (ctx, { userId, tier }) => {
    const { userId: actorUserId } = await requireAdminUser(ctx);

    const user = await ctx.db.get("users", userId);
    if (!user) throw new Error("User not found");

    const previousTier = user.tier ?? "free";
    await ctx.db.patch(userId, { tier, updatedAt: Date.now() });

    await writeAuditLog(ctx, {
      actorUserId,
      targetUserId: userId,
      action: "user.setTier",
      details: { previousTier, tier },
    });

    return null;
  },
});

export const setRole = mutation({
  args: {
    userId: v.id("users"),
    role: userRole,
  },
  returns: v.null(),
  handler: async (ctx, { userId, role }) => {
    const { userId: actorUserId } = await requireAdminUser(ctx);

    const user = await ctx.db.get("users", userId);
    if (!user) throw new Error("User not found");

    if (userId === actorUserId && role !== "admin") {
      throw new Error("Cannot remove your own admin role");
    }

    const previousRole = user.role ?? "user";
    await ctx.db.patch(userId, { role, updatedAt: Date.now() });

    await writeAuditLog(ctx, {
      actorUserId,
      targetUserId: userId,
      action: "user.setRole",
      details: { previousRole, role },
    });

    return null;
  },
});

export const resetQuotas = mutation({
  args: {
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const { userId: actorUserId } = await requireAdminUser(ctx);

    const user = await ctx.db.get("users", userId);
    if (!user) throw new Error("User not found");

    const previousUsed = user.usedAudioSeconds ?? 0;
    await ctx.db.patch(userId, {
      usedAudioSeconds: 0,
      allocatedAudioSeconds: user.allocatedAudioSeconds ?? DEFAULT_AUDIO_SECONDS,
      updatedAt: Date.now(),
    });

    await writeAuditLog(ctx, {
      actorUserId,
      targetUserId: userId,
      action: "user.resetQuotas",
      details: { previousUsed },
    });

    return null;
  },
});

export const restoreLegacyData = mutation({
  args: {
    email: v.string(),
    sourceLegacyId: v.optional(v.string()),
    grantPremium: v.optional(v.boolean()),
    grantAdmin: v.optional(v.boolean()),
  },
  returns: v.object({
    targetUserId: v.id("users"),
    sourceUserId: v.id("users"),
    moved: v.object({
      tasks: v.number(),
      notebooks: v.number(),
      taskLists: v.number(),
      taskListItems: v.number(),
      userTagDefinitions: v.number(),
    }),
  }),
  handler: async (ctx, args): Promise<{
    targetUserId: Id<"users">;
    sourceUserId: Id<"users">;
    moved: {
      tasks: number;
      notebooks: number;
      taskLists: number;
      taskListItems: number;
      userTagDefinitions: number;
    };
  }> => {
    const { userId: actorUserId } = await requireAdminUser(ctx);

    const result: {
      targetUserId: Id<"users">;
      sourceUserId: Id<"users">;
      moved: {
        tasks: number;
        notebooks: number;
        taskLists: number;
        taskListItems: number;
        userTagDefinitions: number;
      };
    } = await ctx.runMutation(internal.adminRestore.restoreDataToAuthUser, args);

    await writeAuditLog(ctx, {
      actorUserId,
      targetUserId: result.targetUserId,
      action: "user.restoreLegacyData",
      details: {
        email: args.email.trim().toLowerCase(),
        sourceLegacyId: args.sourceLegacyId,
        grantPremium: args.grantPremium ?? false,
        grantAdmin: args.grantAdmin ?? false,
        moved: result.moved,
      },
    });

    return result;
  },
});
