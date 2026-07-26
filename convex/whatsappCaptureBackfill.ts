"use node";

import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import type { GreenApiCredentials } from "./lib/greenApiSend";
import { isSystemWhatsAppReply, parseGreenApiWebhook } from "./lib/greenApiParser";
import { normalizePhone } from "./lib/phone";
import { normalizeGroupChatId, isGroupWhatsAppChat } from "./lib/whatsappCaptureGroup";

type OutgoingRow = {
  type?: string;
  idMessage?: string;
  typeMessage?: string;
  chatId?: string;
  textMessage?: string;
  downloadUrl?: string;
  mimeType?: string;
  caption?: string;
  timestamp?: number;
  fileName?: string;
  sendByApi?: boolean;
  isDeleted?: boolean;
  extendedTextMessage?: { text?: string };
  quotedMessage?: { textMessage?: string };
};

type BackfillResult = {
  scanned: number;
  scheduled: number;
  items: Array<{ messageId: string; type: string; chatId: string }>;
  reason?: string;
  captureGroupChatId?: string;
};

type WhatsAppUser = {
  userId: Id<"users">;
  name: string | null;
  email: string | null;
  phone: string;
  phoneVerified: boolean;
};

type ClassifiedCapture = {
  messageId: string;
  chatId: string;
  messageType: "text" | "audio" | "image";
  text?: string;
  audioUrl?: string;
  imageUrl?: string;
  mimeType?: string;
};

function historyRowText(row: OutgoingRow): string | undefined {
  const candidates = [
    row.textMessage,
    row.caption,
    row.extendedTextMessage?.text,
    row.quotedMessage?.textMessage,
  ];
  for (const raw of candidates) {
    const text = raw?.trim();
    if (text) return text;
  }
  return undefined;
}

function classifyCaptureRow(row: OutgoingRow): ClassifiedCapture | null {
  const messageId = row.idMessage?.trim();
  const chatId = row.chatId?.trim() ?? "";
  const typeMessage = row.typeMessage ?? "";
  if (!messageId || !chatId) return null;
  if (row.sendByApi === true) return null;
  if (row.isDeleted === true) return null;
  // Capture group posts show as outgoing; Message Yourself is @c.us.
  if (!isGroupWhatsAppChat(chatId) && !chatId.endsWith("@c.us")) return null;
  // getChatHistory marks direction. Linked-device posts in groups often arrive
  // as "incoming" (same as webhook @lid path) — still capture those.
  // Skip other people's incoming only via webhook owner-gate; history backfill
  // is scoped to the owner's capture group and typically lists the instance's
  // own posts. Accept missing type / outgoing / incoming in groups.
  if (
    row.type &&
    row.type !== "outgoing" &&
    row.type !== "incoming" &&
    !isGroupWhatsAppChat(chatId)
  ) {
    return null;
  }
  // Personal @c.us: only outgoing (Message Yourself from linked phone).
  if (chatId.endsWith("@c.us") && row.type && row.type !== "outgoing") {
    return null;
  }

  const normalizedChat = normalizeGroupChatId(chatId);

  if (typeMessage === "audioMessage" || typeMessage === "pttMessage") {
    return {
      messageId,
      chatId: normalizedChat,
      messageType: "audio",
      audioUrl: row.downloadUrl?.trim() || undefined,
      mimeType: row.mimeType ?? "audio/ogg",
    };
  }

  if (
    typeMessage === "imageMessage" ||
    (typeMessage === "documentMessage" &&
      ((row.mimeType ?? "").startsWith("image/") ||
        /\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(row.fileName ?? "")))
  ) {
    return {
      messageId,
      chatId: normalizedChat,
      messageType: "image",
      imageUrl: row.downloadUrl,
      mimeType: row.mimeType ?? "image/jpeg",
      text: historyRowText(row),
    };
  }

  if (
    typeMessage === "textMessage" ||
    typeMessage === "extendedTextMessage" ||
    typeMessage === "quotedMessage"
  ) {
    const text = historyRowText(row);
    if (!text) return null;
    if (isSystemWhatsAppReply(text)) return null;
    return {
      messageId,
      chatId: normalizedChat,
      messageType: "text",
      text,
    };
  }

  // Fallback: some history rows omit typeMessage but still carry text.
  const fallbackText = historyRowText(row);
  if (fallbackText && !isSystemWhatsAppReply(fallbackText)) {
    return {
      messageId,
      chatId: normalizedChat,
      messageType: "text",
      text: fallbackText,
    };
  }

  return null;
}

async function fetchLastOutgoing(
  base: string,
  creds: GreenApiCredentials,
  minutes: number,
): Promise<OutgoingRow[]> {
  const url = `${base}/waInstance${creds.instanceId}/lastOutgoingMessages/${creds.token}?minutes=${minutes}`;
  const response = await fetch(url);
  if (!response.ok) return [];
  const rowsUnknown: unknown = await response.json();
  return Array.isArray(rowsUnknown) ? (rowsUnknown as OutgoingRow[]) : [];
}

/**
 * Critical for yellowCard / missed webhooks: lastOutgoingMessages often omits
 * group posts, while getChatHistory still returns them for the capture group.
 */
async function fetchCaptureGroupHistory(
  base: string,
  creds: GreenApiCredentials,
  captureGroupId: string,
  minutes: number,
): Promise<OutgoingRow[]> {
  if (!isGroupWhatsAppChat(captureGroupId) && !captureGroupId.endsWith("@c.us")) {
    return [];
  }
  const url = `${base}/waInstance${creds.instanceId}/getChatHistory/${creds.token}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId: captureGroupId, count: 200 }),
  });
  if (!response.ok) {
    console.warn(
      `[whatsappCaptureBackfill] getChatHistory failed: ${response.status}`,
    );
    return [];
  }
  const rowsUnknown: unknown = await response.json();
  if (!Array.isArray(rowsUnknown)) return [];

  const cutoffSec = Math.floor(Date.now() / 1000) - minutes * 60;
  const filtered = (rowsUnknown as OutgoingRow[]).filter((row) => {
    if (typeof row.timestamp === "number" && row.timestamp < cutoffSec) {
      return false;
    }
    return true;
  });
  console.log(
    `[whatsappCaptureBackfill] getChatHistory raw=${rowsUnknown.length} inWindow=${filtered.length} minutes=${minutes}`,
  );
  return filtered;
}

/**
 * Under yellowCard webhooks often fail silently while Green-API queues the
 * payloads. Drain receiveNotification so capture keeps working.
 */
async function drainQueuedNotifications(
  base: string,
  creds: GreenApiCredentials,
  max = 25,
): Promise<unknown[]> {
  const bodies: unknown[] = [];
  for (let i = 0; i < max; i += 1) {
    const receiveUrl = `${base}/waInstance${creds.instanceId}/receiveNotification/${creds.token}?receiveTimeout=1`;
    let response: Response;
    try {
      response = await fetch(receiveUrl);
    } catch {
      break;
    }
    if (!response.ok) break;
    const payload = (await response.json().catch(() => null)) as {
      receiptId?: number | string;
      body?: unknown;
    } | null;
    if (!payload || payload.body == null || payload.receiptId == null) {
      break;
    }
    bodies.push(payload.body);
    const receiptId = encodeURIComponent(String(payload.receiptId));
    try {
      await fetch(
        `${base}/waInstance${creds.instanceId}/deleteNotification/${creds.token}/${receiptId}`,
        { method: "DELETE" },
      );
    } catch {
      // keep draining even if ack fails
    }
  }
  if (bodies.length > 0) {
    console.log(
      `[whatsappCaptureBackfill] drained ${bodies.length} queued Green-API notifications`,
    );
  }
  return bodies;
}

function mergeUniqueRows(...lists: OutgoingRow[][]): OutgoingRow[] {
  const byId = new Map<string, OutgoingRow>();
  for (const list of lists) {
    for (const row of list) {
      const id = row.idMessage?.trim();
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, row);
    }
  }
  return [...byId.values()];
}

/** Ops helper — no args (Windows shells often strip JSON quotes). */
export const backfillNow = internalAction({
  args: {},
  returns: v.object({
    scanned: v.number(),
    scheduled: v.number(),
    items: v.array(
      v.object({
        messageId: v.string(),
        type: v.string(),
        chatId: v.string(),
      }),
    ),
    reason: v.optional(v.string()),
    captureGroupChatId: v.optional(v.string()),
  }),
  handler: async (ctx): Promise<BackfillResult> => {
    return await ctx.runAction(
      internal.whatsappCaptureBackfill.backfillRecentOutgoingCapture,
      // Wide window: yellowCard drops webhooks; recover up to 3 days of group history.
      { minutes: 72 * 60 },
    );
  },
});

/** Explicit 3-day recovery for yellowCard outages (no shell JSON args). */
export const backfillLastThreeDays = internalAction({
  args: {},
  returns: v.object({
    scanned: v.number(),
    scheduled: v.number(),
    items: v.array(
      v.object({
        messageId: v.string(),
        type: v.string(),
        chatId: v.string(),
      }),
    ),
    reason: v.optional(v.string()),
    captureGroupChatId: v.optional(v.string()),
  }),
  handler: async (ctx): Promise<BackfillResult> => {
    return await ctx.runAction(
      internal.whatsappCaptureBackfill.backfillRecentOutgoingCapture,
      { minutes: 72 * 60, email: "erezbabayan@gmail.com" },
    );
  },
});

/**
 * Ops: clear orphan receipts (skipped/ingested without board rows) then backfill.
 * Does NOT resurrect soft-deleted items.
 */
export const recoverCaptureNow = internalAction({
  args: {},
  returns: v.object({
    clearedReceipts: v.number(),
    purgedResurrections: v.number(),
    scanned: v.number(),
    scheduled: v.number(),
    items: v.array(
      v.object({
        messageId: v.string(),
        type: v.string(),
        chatId: v.string(),
      }),
    ),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx): Promise<{
    clearedReceipts: number;
    purgedResurrections: number;
    scanned: number;
    scheduled: number;
    items: Array<{ messageId: string; type: string; chatId: string }>;
    reason?: string;
  }> => {
    const user: WhatsAppUser | null = await ctx.runQuery(
      internal.reminders.findUserForWhatsAppTest,
      { email: "erezbabayan@gmail.com" },
    );
    if (!user) {
      return {
        clearedReceipts: 0,
        purgedResurrections: 0,
        scanned: 0,
        scheduled: 0,
        items: [],
        reason: "user_not_found",
      };
    }
    const purged: { softDeleted: number; receiptsUpgraded: number } =
      await ctx.runMutation(internal.ingest.purgeResurrectedWhatsappItems, {
        userId: user.userId,
      });
    await ctx.runMutation(internal.ingest.seedReceiptsFromSoftDeleted, {
      userId: user.userId,
    });
    const cleared: { cleared: number } = await ctx.runMutation(
      internal.ingest.clearOrphanWhatsappReceipts,
      { userId: user.userId },
    );
    const backfill: BackfillResult = await ctx.runAction(
      internal.whatsappCaptureBackfill.backfillRecentOutgoingCapture,
      { minutes: 72 * 60, scheduleFollowUps: false },
    );
    return {
      clearedReceipts: cleared.cleared,
      purgedResurrections: purged.softDeleted,
      scanned: backfill.scanned,
      scheduled: backfill.scheduled,
      items: backfill.items,
      reason: backfill.reason,
    };
  },
});

/**
 * Ops: peek recent capture-group history + classification (debug text/voice misses).
 */
export const inspectRecentCapture = internalAction({
  args: {},
  returns: v.object({
    stateInstance: v.union(v.string(), v.null()),
    captureGroupChatId: v.union(v.string(), v.null()),
    historyCount: v.number(),
    classified: v.array(
      v.object({
        messageId: v.string(),
        type: v.string(),
        direction: v.string(),
        typeMessage: v.string(),
        hasText: v.boolean(),
        textPreview: v.string(),
        complete: v.boolean(),
        receiptReason: v.union(v.string(), v.null()),
      }),
    ),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx): Promise<{
    stateInstance: string | null;
    captureGroupChatId: string | null;
    historyCount: number;
    classified: Array<{
      messageId: string;
      type: string;
      direction: string;
      typeMessage: string;
      hasText: boolean;
      textPreview: string;
      complete: boolean;
      receiptReason: string | null;
    }>;
    reason?: string;
  }> => {
    const creds: GreenApiCredentials | null = await ctx.runQuery(
      internal.whatsappConfig.getGreenApiCredentialsInternal,
      {},
    );
    if (!creds) {
      return {
        stateInstance: null,
        captureGroupChatId: null,
        historyCount: 0,
        classified: [],
        reason: "green_api_not_configured",
      };
    }
    const user: WhatsAppUser | null = await ctx.runQuery(
      internal.reminders.findUserForWhatsAppTest,
      { email: "erezbabayan@gmail.com" },
    );
    if (!user) {
      return {
        stateInstance: null,
        captureGroupChatId: null,
        historyCount: 0,
        classified: [],
        reason: "user_not_found",
      };
    }
    const capture: { chatId: string; name?: string | null } | null =
      await ctx.runQuery(internal.users.getCaptureGroupInternal, {
        userId: user.userId,
      });
    const captureGroupId: string | null = capture?.chatId ?? null;
    const base = creds.baseUrl.replace(/\/$/, "");
    let stateInstance: string | null = null;
    try {
      const stateRes = await fetch(
        `${base}/waInstance${creds.instanceId}/getStateInstance/${creds.token}`,
      );
      if (stateRes.ok) {
        const state = (await stateRes.json()) as { stateInstance?: string };
        stateInstance = state.stateInstance ?? null;
      }
    } catch {
      // ignore
    }
    if (!captureGroupId) {
      return {
        stateInstance,
        captureGroupChatId: null,
        historyCount: 0,
        classified: [],
        reason: "no_capture_group",
      };
    }
    const rows = await fetchCaptureGroupHistory(base, creds, captureGroupId, 72 * 60);
    const classified: Array<{
      messageId: string;
      type: string;
      direction: string;
      typeMessage: string;
      hasText: boolean;
      textPreview: string;
      complete: boolean;
      receiptReason: string | null;
    }> = [];
    for (const row of rows.slice(0, 40)) {
      const c = classifyCaptureRow(row);
      if (!c) continue;
      const receipt: boolean = await ctx.runQuery(internal.ingest.hasWhatsappReceipt, {
        userId: user.userId,
        messageId: c.messageId,
      });
      const complete: boolean = await ctx.runQuery(internal.ingest.isCaptureComplete, {
        userId: user.userId,
        messageId: c.messageId,
      });
      classified.push({
        messageId: c.messageId,
        type: c.messageType,
        direction: row.type ?? "unknown",
        typeMessage: row.typeMessage ?? "",
        hasText: Boolean(c.text),
        textPreview: (c.text ?? "").slice(0, 80),
        complete,
        receiptReason: receipt ? "present" : null,
      });
    }
    return {
      stateInstance,
      captureGroupChatId: captureGroupId,
      historyCount: rows.length,
      classified,
    };
  },
});

/** Reprocess the latest outgoing WhatsApp image for the linked account. */
export const reprocessLatestImage = internalAction({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    reason: v.string(),
    messageId: v.optional(v.string()),
    createdCount: v.optional(v.number()),
    rawTranscription: v.optional(v.string()),
    engine: v.optional(v.string()),
  }),
  handler: async (ctx): Promise<{
    ok: boolean;
    reason: string;
    messageId?: string;
    createdCount?: number;
    rawTranscription?: string;
    engine?: string;
  }> => {
    const creds: GreenApiCredentials | null = await ctx.runQuery(
      internal.whatsappConfig.getGreenApiCredentialsInternal,
      {},
    );
    if (!creds) {
      return { ok: false, reason: "green_api_not_configured" };
    }

    const user: WhatsAppUser | null = await ctx.runQuery(
      internal.reminders.findUserForWhatsAppTest,
      { email: "erezbabayan@gmail.com" },
    );
    if (!user?.phoneVerified) {
      return { ok: false, reason: "user_not_found" };
    }

    const base: string = creds.baseUrl.replace(/\/$/, "");
    const captureGroupRow = await ctx.runQuery(internal.users.getCaptureGroupInternal, {
      userId: user.userId,
    });
    const history = captureGroupRow?.chatId
      ? await fetchCaptureGroupHistory(base, creds, captureGroupRow.chatId, 24 * 60)
      : [];
    const outgoing = await fetchLastOutgoing(base, creds, 24 * 60);
    const rows = mergeUniqueRows(history, outgoing);
    const image = rows.find(
      (row) =>
        row.typeMessage === "imageMessage" ||
        (row.typeMessage === "documentMessage" &&
          (row.mimeType ?? "").startsWith("image/")),
    );
    if (!image?.idMessage || !image.chatId) {
      return { ok: false, reason: "no_recent_image" };
    }

    const result = await ctx.runAction(internal.visionPipeline.processNotebookImage, {
      userId: user.userId,
      messageId: image.idMessage,
      imageUrl: image.downloadUrl,
      chatId: image.chatId,
      senderPhone: user.phone,
      mimeType: image.mimeType ?? "image/jpeg",
      caption: image.caption,
    });

    return {
      ok: result.ok,
      reason: result.reason,
      messageId: image.idMessage,
      createdCount: result.createdCount,
      rawTranscription: result.rawTranscription,
      engine: result.engine,
    };
  },
});

/**
 * Backup path when Green-API webhooks drop (common under yellowCard):
 * 1) lastOutgoingMessages — Message Yourself / some group sends
 * 2) getChatHistory(captureGroup) — reliable group recovery path
 */
export const backfillRecentOutgoingCapture = internalAction({
  args: {
    email: v.optional(v.string()),
    minutes: v.optional(v.number()),
    /** When true (cron), schedule extra polls within the minute for near-instant catch-up. */
    scheduleFollowUps: v.optional(v.boolean()),
  },
  returns: v.object({
    scanned: v.number(),
    scheduled: v.number(),
    items: v.array(
      v.object({
        messageId: v.string(),
        type: v.string(),
        chatId: v.string(),
      }),
    ),
    reason: v.optional(v.string()),
    captureGroupChatId: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<BackfillResult> => {
    const creds: GreenApiCredentials | null = await ctx.runQuery(
      internal.whatsappConfig.getGreenApiCredentialsInternal,
      {},
    );
    if (!creds) {
      return { scanned: 0, scheduled: 0, items: [], reason: "green_api_not_configured" };
    }

    let user: WhatsAppUser | null = null;
    const emailArg = args.email?.trim().toLowerCase();
    if (emailArg) {
      user = await ctx.runQuery(internal.reminders.findUserForWhatsAppTest, {
        email: emailArg,
      });
    } else {
      const baseForWa = creds.baseUrl.replace(/\/$/, "");
      try {
        const waRes = await fetch(
          `${baseForWa}/waInstance${creds.instanceId}/getWaSettings/${creds.token}`,
        );
        if (waRes.ok) {
          const wa = (await waRes.json()) as { phone?: string };
          if (wa.phone) {
            const phone = normalizePhone(
              wa.phone.startsWith("+") ? wa.phone : `+${wa.phone}`,
            );
            const found = await ctx.runQuery(internal.whatsappWebhook.findVerifiedByPhone, {
              phone,
            });
            if (found) {
              user = {
                userId: found.userId,
                name: null,
                email: found.email ?? null,
                phone: found.phone,
                phoneVerified: true,
              };
            }
          }
        }
      } catch {
        // fall through
      }
      if (!user) {
        user = await ctx.runQuery(internal.reminders.findUserForWhatsAppTest, {
          email: "erezbabayan@gmail.com",
        });
      }
    }
    if (!user?.phoneVerified) {
      return {
        scanned: 0,
        scheduled: 0,
        items: [],
        reason: "user_not_found_or_no_phone",
      };
    }

    const base: string = creds.baseUrl.replace(/\/$/, "");

    // Log restriction only — do NOT create in-app alerts on every 2–5 min poll
    // (that caused notification spam / duplicate-row races under yellowCard).
    let restricted = false;
    try {
      const stateRes = await fetch(
        `${base}/waInstance${creds.instanceId}/getStateInstance/${creds.token}`,
      );
      if (stateRes.ok) {
        const state = (await stateRes.json()) as { stateInstance?: string };
        if (state.stateInstance && state.stateInstance !== "authorized") {
          restricted = true;
          console.warn(
            `[whatsappCaptureBackfill] Green-API state=${state.stateInstance} — webhooks unreliable; using chat-history backfill`,
          );
        }
      }
    } catch {
      // non-fatal
    }

    // Prefer a wide history window — webhooks can miss messages even when
    // getChatHistory is healthy (including under yellowCard outbound limits).
    const minutes: number = Math.min(
      Math.max(args.minutes ?? (restricted ? 48 * 60 : 180), 5),
      7 * 24 * 60,
    );

    const captureGroupRow = await ctx.runQuery(internal.users.getCaptureGroupInternal, {
      userId: user.userId,
    });
    let captureGroupId = captureGroupRow?.chatId ?? null;

    const outgoingRows = await fetchLastOutgoing(base, creds, minutes);
    const historyRows = captureGroupId
      ? await fetchCaptureGroupHistory(base, creds, captureGroupId, minutes)
      : [];
    const rows = mergeUniqueRows(historyRows, outgoingRows);

    // Auto-discover capture chat: prefer group, else personal @c.us (free tier).
    if (!captureGroupId && rows.length > 0) {
      const groupCounts = new Map<string, number>();
      const personalCounts = new Map<string, number>();
      for (const row of rows) {
        const cid = row.chatId?.trim() ?? "";
        const normalized = normalizeGroupChatId(cid);
        if (isGroupWhatsAppChat(cid)) {
          groupCounts.set(normalized, (groupCounts.get(normalized) ?? 0) + 1);
        } else if (cid.endsWith("@c.us")) {
          personalCounts.set(normalized, (personalCounts.get(normalized) ?? 0) + 1);
        }
      }
      let best: string | null = null;
      let bestCount = 0;
      for (const [id, count] of groupCounts) {
        if (count > bestCount) {
          best = id;
          bestCount = count;
        }
      }
      if (!best) {
        for (const [id, count] of personalCounts) {
          if (count > bestCount) {
            best = id;
            bestCount = count;
          }
        }
      }
      if (best) {
        await ctx.runMutation(internal.users.setCaptureGroupByEmail, {
          email: user.email ?? "erezbabayan@gmail.com",
          chatId: best,
          name: isGroupWhatsAppChat(best) ? undefined : "הודעה לעצמי (BabiTk)",
        });
        captureGroupId = best;
      }
    }

    if (rows.length === 0 && !captureGroupId) {
      return {
        scanned: 0,
        scheduled: 0,
        items: [],
        reason: "no_outgoing_in_window",
        captureGroupChatId: captureGroupId ?? undefined,
      };
    }

    await ctx.runMutation(internal.ingest.seedReceiptsFromSoftDeleted, {
      userId: user.userId,
    });

    const scheduled: Array<{ messageId: string; type: string; chatId: string }> =
      [];

    // Drain webhook queue first (yellowCard often blocks push webhooks).
    const queuedBodies = await drainQueuedNotifications(base, creds);
    for (const body of queuedBodies) {
      const parsed = parseGreenApiWebhook(body);
      if (parsed.ignored || parsed.messages.length === 0) continue;
      for (const message of parsed.messages) {
        if (
          message.type !== "text" &&
          message.type !== "audio" &&
          message.type !== "image"
        ) {
          continue;
        }
        const captureNormalized = captureGroupId
          ? normalizeGroupChatId(captureGroupId)
          : null;
        if (
          captureNormalized &&
          normalizeGroupChatId(message.chatId) !== captureNormalized &&
          !message.chatId.endsWith("@c.us")
        ) {
          continue;
        }
        const complete: boolean = await ctx.runQuery(
          internal.ingest.isCaptureComplete,
          { userId: user.userId, messageId: message.messageId },
        );
        if (complete) continue;

        await ctx.scheduler.runAfter(
          0,
          internal.inboundPipeline.processGreenApiMessage,
          {
            userId: user.userId,
            messageId: message.messageId,
            senderPhone: user.phone,
            chatId: message.chatId,
            messageType: message.type,
            text: message.text,
            audioUrl: message.audioUrl,
            imageUrl: message.imageUrl,
            mimeType: message.mimeType,
          },
        );
        scheduled.push({
          messageId: message.messageId,
          type: message.type,
          chatId: message.chatId,
        });
      }
    }

    const captureNormalized = captureGroupId
      ? normalizeGroupChatId(captureGroupId)
      : null;

    for (const row of rows) {
      const classified = classifyCaptureRow(row);
      if (!classified) continue;
      if (captureNormalized && classified.chatId !== captureNormalized) continue;

      const complete: boolean = await ctx.runQuery(
        internal.ingest.isCaptureComplete,
        {
          userId: user.userId,
          messageId: classified.messageId,
        },
      );
      // Soft-deleted / skipped tombstones stay complete; orphan receipts retry.
      if (complete) continue;

      // Avoid double-schedule if we already queued from receiveNotification.
      if (scheduled.some((s) => s.messageId === classified.messageId)) continue;

      await ctx.scheduler.runAfter(0, internal.inboundPipeline.processGreenApiMessage, {
        userId: user.userId,
        messageId: classified.messageId,
        senderPhone: user.phone,
        chatId: classified.chatId,
        messageType: classified.messageType,
        text: classified.text,
        audioUrl: classified.audioUrl,
        imageUrl: classified.imageUrl,
        mimeType: classified.mimeType,
      });
      scheduled.push({
        messageId: classified.messageId,
        type: classified.messageType,
        chatId: classified.chatId,
      });
    }

    if (args.scheduleFollowUps) {
      // Convex crons can't run more often than once a minute — fill the gaps
      // so missed webhooks still surface within ~12s.
      const followMinutes = Math.min(Math.max(minutes, 30), 48 * 60);
      for (const delayMs of [12_000, 24_000, 36_000, 48_000]) {
        await ctx.scheduler.runAfter(
          delayMs,
          internal.whatsappCaptureBackfill.backfillRecentOutgoingCapture,
          {
            email: args.email,
            minutes: followMinutes,
            scheduleFollowUps: false,
          },
        );
      }
    }

    return {
      scanned: rows.length,
      scheduled: scheduled.length,
      items: scheduled,
      captureGroupChatId: captureGroupId ?? undefined,
      reason:
        scheduled.length === 0 && historyRows.length > 0
          ? "history_scanned_nothing_new"
          : undefined,
    };
  },
});
