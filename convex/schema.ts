import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import {
  notebookStatus,
  sourceType,
  taskStatus,
  userTier,
} from "./validators";

/**
 * MindTasker Convex data model — Step A
 *
 * users     — profiles, phone numbers, WhatsApp routing, quotas
 * tasks     — Inbox (actionable items)
 * notebooks — text extracted from notebook photos (OCR pipeline)
 */
export default defineSchema({
  users: defineTable({
    /** Convex Auth subject (set when user signs in). */
    tokenIdentifier: v.optional(v.string()),
    /** Supabase / demo UUID for migration. */
    legacyId: v.optional(v.string()),
    email: v.string(),
    /** E.164 or normalized digits — used for WhatsApp sender lookup. */
    phone: v.optional(v.string()),
    phoneVerified: v.boolean(),
    tier: userTier,
    allocatedAudioSeconds: v.number(),
    usedAudioSeconds: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_legacy_id", ["legacyId"])
    .index("by_email", ["email"])
    .index("by_phone", ["phone"]),

  tasks: defineTable({
    userId: v.id("users"),
    legacyId: v.optional(v.string()),
    title: v.string(),
    content: v.string(),
    status: taskStatus,
    dueDate: v.union(v.string(), v.null()),
    completedAt: v.union(v.string(), v.null()),
    calendarEventId: v.union(v.string(), v.null()),
    tags: v.array(v.string()),
    metadata: v.optional(v.any()),
    sourceType: v.optional(sourceType),
    sourceStorageUrl: v.optional(v.union(v.string(), v.null())),
    sourceStorageId: v.optional(v.id("_storage")),
    sourceRawText: v.optional(v.union(v.string(), v.null())),
    sortOrder: v.number(),
    lastInteractedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.union(v.number(), v.null()),
  })
    .index("by_user", ["userId"])
    .index("by_legacy_id", ["legacyId"])
    .index("by_user_deleted", ["userId", "deletedAt"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_due", ["userId", "dueDate"]),

  notebooks: defineTable({
    userId: v.id("users"),
    legacyId: v.optional(v.string()),
    title: v.string(),
    /** Parsed / display text (after OCR proofread + ingest). */
    content: v.string(),
    /** Verbatim OCR output from the notebook image. */
    rawText: v.union(v.string(), v.null()),
    /** Linguistically corrected transcription (GPT mini proofread). */
    correctedText: v.optional(v.union(v.string(), v.null())),
    status: notebookStatus,
    tags: v.array(v.string()),
    metadata: v.optional(v.any()),
    sourceType,
    /** Legacy external URL (Green-API) or signed URL snapshot. */
    storageUrl: v.union(v.string(), v.null()),
    sourceStorageId: v.optional(v.id("_storage")),
    /** OpenAI text-embedding-3-small (1536) — populated in a later step. */
    embedding: v.optional(v.array(v.float64())),
    sortOrder: v.number(),
    lastInteractedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.union(v.number(), v.null()),
  })
    .index("by_user", ["userId"])
    .index("by_legacy_id", ["legacyId"])
    .index("by_user_deleted", ["userId", "deletedAt"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_created", ["userId", "createdAt"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["userId"],
    }),
});
