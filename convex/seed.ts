import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation } from "./_generated/server";
import { sourceType, taskStatus } from "./validators";

const syncSourceMaterial = v.object({
  id: v.string(),
  source_type: sourceType,
  storage_url: v.union(v.string(), v.null()),
  raw_text: v.union(v.string(), v.null()),
  metadata: v.optional(v.any()),
});

const syncItem = v.object({
  id: v.string(),
  user_id: v.string(),
  source_material_id: v.union(v.string(), v.null()),
  source_materials: v.optional(v.union(syncSourceMaterial, v.null())),
  title: v.string(),
  content: v.string(),
  is_actionable: v.boolean(),
  status: taskStatus,
  due_date: v.union(v.string(), v.null()),
  completed_at: v.union(v.string(), v.null()),
  tags: v.array(v.string()),
  metadata: v.optional(v.any()),
  sort_order: v.optional(v.number()),
  last_interacted_at: v.optional(v.string()),
  created_at: v.optional(v.string()),
  updated_at: v.optional(v.string()),
  deleted_at: v.union(v.string(), v.null()),
});

function parseTime(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function mapNoteStatus(
  status: "inbox" | "pending" | "completed" | "snoozed_archive",
): "inbox" | "pending" | "archived" {
  if (status === "inbox") return "inbox";
  if (status === "pending") return "pending";
  return "archived";
}

async function ensureUser(
  ctx: MutationCtx,
  legacyUserId: string,
): Promise<Id<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_legacy_id", (q) => q.eq("legacyId", legacyUserId))
    .unique();

  if (existing) return existing._id;

  const now = Date.now();
  return await ctx.db.insert("users", {
    legacyId: legacyUserId,
    email: `${legacyUserId}@demo.mindtasker.local`,
    phoneVerified: false,
    tier: "free",
    allocatedAudioSeconds: 1800,
    usedAudioSeconds: 0,
    createdAt: now,
    updatedAt: now,
  });
}

async function upsertTask(
  ctx: MutationCtx,
  userId: Id<"users">,
  item: {
    id: string;
    title: string;
    content: string;
    status: "inbox" | "pending" | "completed" | "snoozed_archive";
    due_date: string | null;
    completed_at: string | null;
    tags: string[];
    metadata?: unknown;
    sort_order?: number;
    last_interacted_at?: string;
    created_at?: string;
    updated_at?: string;
    deleted_at: string | null;
    source_materials?: {
      source_type: "whatsapp_voice" | "whatsapp_text" | "notebook_ocr";
      storage_url: string | null;
      raw_text: string | null;
    } | null;
  },
) {
  const now = Date.now();
  const createdAt = parseTime(item.created_at, now);
  const updatedAt = parseTime(item.updated_at, createdAt);
  const lastInteractedAt = parseTime(item.last_interacted_at, updatedAt);
  const sortOrder = item.sort_order ?? createdAt;
  const source = item.source_materials ?? null;

  const existing = await ctx.db
    .query("tasks")
    .withIndex("by_legacy_id", (q) => q.eq("legacyId", item.id))
    .unique();

  const payload = {
    userId,
    legacyId: item.id,
    title: item.title,
    content: item.content ?? "",
    status: item.status,
    dueDate: item.due_date,
    completedAt: item.completed_at,
    calendarEventId: null,
    tags: item.tags ?? [],
    metadata: item.metadata ?? {},
    sourceType: source?.source_type,
    sourceStorageUrl: source?.storage_url ?? null,
    sourceRawText: source?.raw_text ?? null,
    sortOrder,
    lastInteractedAt,
    createdAt,
    updatedAt,
    deletedAt: item.deleted_at ? parseTime(item.deleted_at, now) : null,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }

  return await ctx.db.insert("tasks", payload);
}

async function upsertNotebook(
  ctx: MutationCtx,
  userId: Id<"users">,
  item: {
    id: string;
    title: string;
    content: string;
    status: "inbox" | "pending" | "completed" | "snoozed_archive";
    tags: string[];
    metadata?: unknown;
    sort_order?: number;
    last_interacted_at?: string;
    created_at?: string;
    updated_at?: string;
    deleted_at: string | null;
    source_materials?: {
      source_type: "whatsapp_voice" | "whatsapp_text" | "notebook_ocr";
      storage_url: string | null;
      raw_text: string | null;
    } | null;
  },
) {
  const now = Date.now();
  const createdAt = parseTime(item.created_at, now);
  const updatedAt = parseTime(item.updated_at, createdAt);
  const lastInteractedAt = parseTime(item.last_interacted_at, updatedAt);
  const sortOrder = item.sort_order ?? createdAt;
  const source = item.source_materials ?? null;

  const existing = await ctx.db
    .query("notebooks")
    .withIndex("by_legacy_id", (q) => q.eq("legacyId", item.id))
    .unique();

  const payload = {
    userId,
    legacyId: item.id,
    title: item.title,
    content: item.content ?? item.title,
    status: mapNoteStatus(item.status),
    tags: item.tags ?? [],
    metadata: item.metadata ?? {},
    sourceType: source?.source_type ?? ("whatsapp_text" as const),
    storageUrl: source?.storage_url ?? null,
    rawText: source?.raw_text ?? item.content ?? null,
    correctedText: null,
    sortOrder,
    lastInteractedAt,
    createdAt,
    updatedAt,
    deletedAt: item.deleted_at ? parseTime(item.deleted_at, now) : null,
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return existing._id;
  }

  return await ctx.db.insert("notebooks", payload);
}

export const importSync = mutation({
  args: {
    legacyUserId: v.string(),
    items: v.array(syncItem),
  },
  handler: async (ctx, { legacyUserId, items }) => {
    const userId = await ensureUser(ctx, legacyUserId);

    let tasks = 0;
    let notebooks = 0;

    for (const item of items) {
      if (item.deleted_at) continue;

      if (item.is_actionable) {
        await upsertTask(ctx, userId, item);
        tasks += 1;
      } else {
        await upsertNotebook(ctx, userId, item);
        notebooks += 1;
      }
    }

    return { tasks, notebooks, total: items.length };
  },
});

/** Wipe demo data for a legacy user (dev only). */
export const clearLegacyUserData = internalMutation({
  args: { legacyUserId: v.string() },
  handler: async (ctx, { legacyUserId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_legacy_id", (q) => q.eq("legacyId", legacyUserId))
      .unique();

    if (!user) return { removed: 0 };

    let removed = 0;

    for (const table of ["tasks", "notebooks"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();

      for (const row of rows) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }

    return { removed };
  },
});
