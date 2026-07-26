import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireAuthUserId, requireScopedUserId } from "./lib/requireAuth";

const inboxArchiveHours = v.union(
  v.literal(48),
  v.literal(72),
  v.literal(168),
  v.literal(720),
);

const DEFAULT_INBOX_ARCHIVE_HOURS = 48 as const;

const boardSettingsValidator = v.object({
  inboxArchiveHours: inboxArchiveHours,
});

type InboxArchiveHours = 48 | 72 | 168 | 720;

function normalizeHours(hours: number | undefined): InboxArchiveHours {
  if (hours === 48 || hours === 72 || hours === 168 || hours === 720) {
    return hours;
  }
  return DEFAULT_INBOX_ARCHIVE_HOURS;
}

async function readSettings(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get("users", userId);
  return { inboxArchiveHours: normalizeHours(user?.inboxArchiveHours) };
}

/** Auth-scoped read (web Convex Auth). */
export const get = query({
  args: {},
  returns: boardSettingsValidator,
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return { inboxArchiveHours: DEFAULT_INBOX_ARCHIVE_HOURS };
    }
    return await readSettings(ctx, userId);
  },
});

/** Explicit user read — same pattern as tag definitions (mobile + web). */
export const getForUser = query({
  args: { userId: v.id("users") },
  returns: boardSettingsValidator,
  handler: async (ctx, args) => {
    const userId = await requireScopedUserId(ctx, args.userId);
    return await readSettings(ctx, userId);
  },
});

/** Auth-scoped write (web Convex Auth). */
export const update = mutation({
  args: {
    inboxArchiveHours: inboxArchiveHours,
  },
  returns: boardSettingsValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const user = await ctx.db.get("users", userId);
    if (!user) {
      throw new Error("משתמש לא נמצא");
    }
    await ctx.db.patch(userId, {
      inboxArchiveHours: args.inboxArchiveHours,
      updatedAt: Date.now(),
    });
    return { inboxArchiveHours: args.inboxArchiveHours };
  },
});

/** Explicit user write — same pattern as tag definitions (mobile + web). */
export const updateForUser = mutation({
  args: {
    userId: v.id("users"),
    inboxArchiveHours: inboxArchiveHours,
  },
  returns: boardSettingsValidator,
  handler: async (ctx, args) => {
    const userId = await requireScopedUserId(ctx, args.userId);
    const user = await ctx.db.get("users", userId);
    if (!user) {
      throw new Error("משתמש לא נמצא");
    }
    await ctx.db.patch(userId, {
      inboxArchiveHours: args.inboxArchiveHours,
      updatedAt: Date.now(),
    });
    return { inboxArchiveHours: args.inboxArchiveHours };
  },
});
