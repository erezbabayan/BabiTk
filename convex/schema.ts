import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
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
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    tokenIdentifier: v.optional(v.string()),
    legacyId: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneVerified: v.optional(v.boolean()),
    tier: v.optional(userTier),
    role: v.optional(v.union(v.literal("admin"), v.literal("user"))),
    allocatedAudioSeconds: v.optional(v.number()),
    usedAudioSeconds: v.optional(v.number()),
    /** Prefer in-app / OS notification center (default true). */
    notifyInApp: v.optional(v.boolean()),
    /** Prefer WhatsApp when phone verified + Green API (default true). */
    notifyWhatsApp: v.optional(v.boolean()),
    /**
     * Send each due task/item reminder to the configured WhatsApp capture
     * group when it fires (default false — opt-in).
     */
    notifyWhatsAppGroup: v.optional(v.boolean()),
    /**
     * Repeat-nag open items whose reminder time passed while still open
     * (default true). Timing: overdueFirstHours then every overdueRepeatHours.
     */
    notifyOverdueReminders: v.optional(v.boolean()),
    /** Hours after reminder fire before the first overdue nag (default 24). */
    overdueFirstHours: v.optional(v.number()),
    /** Hours between subsequent overdue nags (default 48). */
    overdueRepeatHours: v.optional(v.number()),
    /**
     * Legacy / unused for battery keep-alive. Server availability is cloud-side.
     * Kept so older clients do not break on the viewer validator.
     */
    keepAlertsArmed: v.optional(v.boolean()),
    /**
     * CallMeBot personal API key — enables WhatsApp digests without Green/Meta.
     * Activate once via WhatsApp, then paste the key from the bot reply.
     */
    callMeBotApiKey: v.optional(v.string()),
    /**
     * Local hours (0–23, Asia/Jerusalem) for daily WhatsApp reminder digests.
     * Up to 3 values. Default [9] when unset.
     */
    whatsappDigestHours: v.optional(v.array(v.number())),
    /**
     * Which days to send the daily WhatsApp digest (Asia/Jerusalem).
     * - weekdays: Sunday–Thursday (ימי חול)
     * - everyday: full week (default when unset)
     */
    whatsappDigestDays: v.optional(
      v.union(v.literal("weekdays"), v.literal("everyday")),
    ),
    /** @deprecated Prefer whatsappDigestHours. Kept for existing users. */
    whatsappDigestHour: v.optional(v.number()),
    /**
     * Slots already sent: "YYYY-MM-DD:H" in Asia/Jerusalem.
     * Pruned to the current day on write.
     */
    lastWhatsAppDigestSlots: v.optional(v.array(v.string())),
    /** @deprecated Prefer lastWhatsAppDigestSlots. */
    lastWhatsAppDigestDate: v.optional(v.string()),
    /**
     * Failed WhatsApp digest attempts for the current slot (capped retries).
     * Format: "YYYY-MM-DD:H" matching lastWhatsAppDigestSlots keys.
     */
    lastWhatsAppDigestFailSlot: v.optional(v.string()),
    lastWhatsAppDigestFailCount: v.optional(v.number()),
    /**
     * WhatsApp group chat id for capture only (e.g. 120363…@g.us).
     * Only messages the user posts in this group are ingested.
     */
    whatsappCaptureGroupChatId: v.optional(v.string()),
    whatsappCaptureGroupName: v.optional(v.string()),
    /** Hours of notebook inactivity before auto-archive (48/72/168/720). */
    inboxArchiveHours: v.optional(
      v.union(v.literal(48), v.literal(72), v.literal(168), v.literal(720)),
    ),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_token", ["tokenIdentifier"])
    .index("by_legacy_id", ["legacyId"]),

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
    /** Denormalized reminder fire time (ISO) for indexed due scans. */
    notifyAt: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_legacy_id", ["legacyId"])
    .index("by_user_deleted", ["userId", "deletedAt"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_due", ["userId", "dueDate"])
    .index("by_notify_at", ["notifyAt"])
    .index("by_source_storage", ["sourceStorageId"]),

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
    /** Manual reminder datetime for notes (ISO string). */
    dueDate: v.optional(v.union(v.string(), v.null())),
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
    /** Denormalized reminder fire time (ISO) for indexed due scans. */
    notifyAt: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_legacy_id", ["legacyId"])
    .index("by_user_deleted", ["userId", "deletedAt"])
    .index("by_user_status", ["userId", "status"])
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_notify_at", ["notifyAt"])
    .index("by_source_storage", ["sourceStorageId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["userId"],
    }),

  /** Curated task lists — snapshot copies of board tasks, synced bidirectionally. */
  taskLists: defineTable({
    userId: v.id("users"),
    name: v.string(),
    filterTags: v.array(v.string()),
    /** ISO datetime — user reminder for the whole list. */
    reminderAt: v.optional(v.union(v.string(), v.null())),
    /** @deprecated Legacy snapshot ids — replaced by taskListItems. */
    taskIds: v.optional(v.array(v.id("tasks"))),
    status: v.union(v.literal("active"), v.literal("archived")),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.union(v.number(), v.null()),
  })
    .index("by_user", ["userId"])
    .index("by_user_deleted", ["userId", "deletedAt"])
    .index("by_user_status", ["userId", "status"])
    .index("by_reminder_at", ["reminderAt"]),

  /** Snapshot of a board task inside a list — linked via sourceTaskId for sync. */
  taskListItems: defineTable({
    userId: v.id("users"),
    listId: v.id("taskLists"),
    sourceTaskId: v.id("tasks"),
    title: v.string(),
    content: v.string(),
    status: taskStatus,
    dueDate: v.union(v.string(), v.null()),
    completedAt: v.union(v.string(), v.null()),
    tags: v.array(v.string()),
    metadata: v.optional(v.any()),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.union(v.number(), v.null()),
  })
    .index("by_list", ["listId"])
    .index("by_list_deleted", ["listId", "deletedAt"])
    .index("by_source_task", ["sourceTaskId"])
    .index("by_user", ["userId"]),

  /** Per-user tag definitions for ingest + UI. */
  userTagDefinitions: defineTable({
    userId: v.id("users"),
    name: v.string(),
    color: v.string(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_sort", ["userId", "sortOrder"])
    .index("by_user_name", ["userId", "name"]),

  /**
   * Lessons learned from user corrections after ingest.
   * Applied on future parses (tag remaps, split preferences).
   */
  userIngestLessons: defineTable({
    userId: v.id("users"),
    kind: v.union(
      v.literal("tag_remap"),
      v.literal("topic_tag"),
      v.literal("prefer_split"),
      v.literal("prefer_merge"),
    ),
    /** Short cue from the original capture (keywords / phrase). */
    cueText: v.string(),
    /** Previous wrong value (e.g. tag "עבודה"). */
    fromValue: v.optional(v.string()),
    /** Correct value (e.g. tag "לימודים"). */
    toValue: v.string(),
    weight: v.number(),
    sourceItemId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_kind", ["userId", "kind"])
    .index("by_user_cue", ["userId", "cueText"]),

  /** Admin actions — who changed what, for which user. */
  auditLogs: defineTable({
    actorUserId: v.id("users"),
    targetUserId: v.optional(v.id("users")),
    action: v.string(),
    details: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_actor", ["actorUserId", "createdAt"])
    .index("by_target", ["targetUserId", "createdAt"]),

  /** In-app notification center rows (reminders and future alerts). */
  notifications: defineTable({
    userId: v.id("users"),
    kind: v.union(v.literal("item_reminder"), v.literal("list_reminder")),
    title: v.string(),
    body: v.string(),
    taskId: v.optional(v.id("tasks")),
    notebookId: v.optional(v.id("notebooks")),
    listId: v.optional(v.id("taskLists")),
    /** ISO fire time this notification represents. */
    fireAt: v.string(),
    /** Idempotency key: user + target + fireAt. */
    dedupeKey: v.string(),
    read: v.boolean(),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_read", ["userId", "read"])
    .index("by_user_dedupe", ["userId", "dedupeKey"]),

  /** Expo push tokens for OS notifications when app is backgrounded. */
  pushTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android"), v.literal("web")),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),

  /**
   * Durable tombstone for WhatsApp message ids already handled (ingested or
   * soft-deleted). Survives trash purge and avoids capture-backfill recreating
   * inbox rows after the user deletes them on the board.
   */
  whatsappIngestReceipts: defineTable({
    userId: v.id("users"),
    messageId: v.string(),
    reason: v.union(
      v.literal("ingested"),
      v.literal("deleted"),
      v.literal("duplicate"),
      /** Terminal skip (junk, unsupported, missing media) — stops backfill reschedule. */
      v.literal("skipped"),
    ),
    createdAt: v.number(),
  })
    .index("by_user_message", ["userId", "messageId"])
    .index("by_message", ["messageId"]),

  /** Singleton-style app secrets (Green-API outbound). */
  appSettings: defineTable({
    key: v.string(),
    greenApiInstanceId: v.optional(v.string()),
    greenApiToken: v.optional(v.string()),
    greenApiUrl: v.optional(v.string()),
    greenApiWebhookToken: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
    updatedBy: v.optional(v.id("users")),
  }).index("by_key", ["key"]),
});
