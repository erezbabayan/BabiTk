import { v } from "convex/values";

import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { DEFAULT_USER_TAG_DEFINITIONS } from "./lib/ingest/defaultTags";
import { requireScopedUserId } from "./lib/requireAuth";

const tagDefinitionDoc = v.object({
  _id: v.id("userTagDefinitions"),
  _creationTime: v.number(),
  userId: v.id("users"),
  name: v.string(),
  color: v.string(),
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const tagPayload = v.object({
  name: v.string(),
  color: v.string(),
  sortOrder: v.number(),
});

const MAX_USER_TAGS = 12;
const FALLBACK_TAG_COLORS = [
  "#93c5fd",
  "#c4b5fd",
  "#fca5a5",
  "#fcd34d",
  "#86efac",
  "#f9a8d4",
  "#67e8f9",
  "#cbd5e1",
  "#7dd3fc",
  "#fda4af",
  "#a5b4fc",
  "#fdba74",
] as const;

function normalizeTagName(name: string): string {
  return name.trim().replace(/^#+/, "");
}

async function backfillDefaults(ctx: MutationCtx, userId: Id<"users">) {
  const existing = await ctx.db
    .query("userTagDefinitions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const now = Date.now();

  if (existing.length === 0) {
    for (const [index, tag] of DEFAULT_USER_TAG_DEFINITIONS.entries()) {
      await ctx.db.insert("userTagDefinitions", {
        userId,
        name: tag.name,
        color: tag.color,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { seeded: true, added: DEFAULT_USER_TAG_DEFINITIONS.length };
  }

  // Backfill newly added default tags (e.g. לימודים) without wiping custom lists.
  const existingNames = new Set(existing.map((tag) => tag.name));
  let maxSort = existing.reduce((max, tag) => Math.max(max, tag.sortOrder), -1);
  let added = 0;
  for (const tag of DEFAULT_USER_TAG_DEFINITIONS) {
    if (existingNames.has(tag.name)) continue;
    maxSort += 1;
    await ctx.db.insert("userTagDefinitions", {
      userId,
      name: tag.name,
      color: tag.color,
      sortOrder: maxSort,
      createdAt: now,
      updatedAt: now,
    });
    added += 1;
  }

  return { seeded: false, added };
}

async function mergeExtras(
  ctx: MutationCtx,
  userId: Id<"users">,
  extras: Array<{ name: string; color: string }> | undefined,
  harvestFromItems: boolean,
): Promise<{ added: number; total: number }> {
  await backfillDefaults(ctx, userId);

  const existing = await ctx.db
    .query("userTagDefinitions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  existing.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "he"));

  const known = new Set(existing.map((tag) => normalizeTagName(tag.name)));
  let maxSort = existing.reduce((max, tag) => Math.max(max, tag.sortOrder), -1);
  let added = 0;
  const now = Date.now();
  const candidates: Array<{ name: string; color: string }> = [];

  if (extras) {
    for (const tag of extras) {
      const name = normalizeTagName(tag.name);
      if (!name || known.has(name)) continue;
      candidates.push({ name, color: tag.color.trim() || "#64748b" });
    }
  }

  if (harvestFromItems) {
    const [tasks, notebooks] = await Promise.all([
      ctx.db
        .query("tasks")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("notebooks")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);
    const counts = new Map<string, number>();
    for (const row of [...tasks, ...notebooks]) {
      for (const raw of row.tags ?? []) {
        const name = normalizeTagName(String(raw));
        if (!name || known.has(name)) continue;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
    for (const [name] of [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "he"),
    )) {
      if (candidates.some((tag) => tag.name === name)) continue;
      candidates.push({
        name,
        color: FALLBACK_TAG_COLORS[candidates.length % FALLBACK_TAG_COLORS.length]!,
      });
    }
  }

  for (const tag of candidates) {
    if (known.has(tag.name)) continue;
    if (existing.length + added >= MAX_USER_TAGS) break;
    maxSort += 1;
    await ctx.db.insert("userTagDefinitions", {
      userId,
      name: tag.name,
      color: tag.color,
      sortOrder: maxSort,
      createdAt: now,
      updatedAt: now,
    });
    known.add(tag.name);
    added += 1;
  }

  return { added, total: existing.length + added };
}

export const listForUser = query({
  args: { userId: v.id("users") },
  returns: v.array(tagDefinitionDoc),
  handler: async (ctx, { userId: requestedUserId }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const tags = await ctx.db
      .query("userTagDefinitions")
      .withIndex("by_user_sort", (q) => q.eq("userId", userId))
      .collect();

    tags.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "he"));
    return tags;
  },
});

/** Client-callable: seed or append missing system defaults for this user. */
export const ensureDefaultsForUser = mutation({
  args: { userId: v.id("users") },
  returns: v.object({
    seeded: v.boolean(),
    added: v.number(),
  }),
  handler: async (ctx, { userId: requestedUserId }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    return await backfillDefaults(ctx, userId);
  },
});

export const listNamesInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const tags = await ctx.db
      .query("userTagDefinitions")
      .withIndex("by_user_sort", (q) => q.eq("userId", userId))
      .collect();

    if (tags.length === 0) {
      return DEFAULT_USER_TAG_DEFINITIONS.map((tag) => tag.name);
    }

    tags.sort((a, b) => a.sortOrder - b.sortOrder);
    return tags.map((tag) => tag.name);
  },
});

export const ensureDefaults = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    return await backfillDefaults(ctx, userId);
  },
});

export const replaceForUser = mutation({
  args: {
    userId: v.id("users"),
    tags: v.array(v.object({ name: v.string(), color: v.string() })),
  },
  returns: v.array(tagPayload),
  handler: async (ctx, { userId: requestedUserId, tags }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    const cleaned = tags
      .map((tag, index) => ({
        name: tag.name.trim(),
        color: tag.color.trim() || "#64748b",
        sortOrder: index,
      }))
      .filter((tag) => tag.name.length > 0);

    if (cleaned.length === 0) {
      throw new Error("At least one tag is required");
    }

    const names = cleaned.map((tag) => tag.name);
    if (new Set(names).size !== names.length) {
      throw new Error("Duplicate tag names are not allowed");
    }

    const existing = await ctx.db
      .query("userTagDefinitions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    const now = Date.now();
    for (const tag of cleaned) {
      await ctx.db.insert("userTagDefinitions", {
        userId,
        name: tag.name,
        color: tag.color,
        sortOrder: tag.sortOrder,
        createdAt: now,
        updatedAt: now,
      });
    }

    return cleaned;
  },
});

/**
 * Merge local/client tags into Convex definitions without wiping customs.
 * Also harvests tag names already used on the user's tasks/notebooks.
 */
export const mergeExtrasForUser = mutation({
  args: {
    userId: v.id("users"),
    extras: v.optional(v.array(v.object({ name: v.string(), color: v.string() }))),
    harvestFromItems: v.optional(v.boolean()),
  },
  returns: v.object({
    added: v.number(),
    total: v.number(),
  }),
  handler: async (ctx, { userId: requestedUserId, extras, harvestFromItems }) => {
    const userId = await requireScopedUserId(ctx, requestedUserId);
    return await mergeExtras(ctx, userId, extras, harvestFromItems !== false);
  },
});

/** CLI / trusted backend: same merge without client auth session. */
export const mergeExtrasInternal = internalMutation({
  args: {
    userId: v.id("users"),
    extras: v.optional(v.array(v.object({ name: v.string(), color: v.string() }))),
    harvestFromItems: v.optional(v.boolean()),
  },
  returns: v.object({
    added: v.number(),
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    return await mergeExtras(ctx, args.userId, args.extras, args.harvestFromItems !== false);
  },
});
