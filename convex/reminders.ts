import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  buildAfterReminderSentPatch,
  getReminderFlags,
} from "./lib/resolveItemReminder";
import { computeNotifyAt, notifyAtPatchValue } from "./lib/notifyAt";
import { getZonedParts } from "./lib/ingest/timezone";
import {
  buildCallMeBotSetupMessage,
  CALLMEBOT_ACTIVATE_URL,
} from "./lib/callMeBot";
import { normalizePhone } from "./lib/phone";

const DIGEST_TIMEZONE = "Asia/Jerusalem";

/** Personal chat id for Message Yourself / self-chat digests. */
function digestPersonalChatId(phone: string): string {
  const digits = normalizePhone(phone).replace(/\D/g, "");
  return `${digits}@c.us`;
}

type DigestSendResult = {
  sent: boolean;
  provider?: "green-api" | "meta" | "callmebot";
  reason?: string;
};

/**
 * Deliver a daily digest on WhatsApp with free-tier-safe fallbacks:
 * 1) CallMeBot (audible), 2) capture group, 3) Message Yourself (Green quota allow-list).
 */
async function deliverDigestWhatsApp(
  send: (args: {
    toPhone: string;
    message: string;
    chatId?: string;
    sameChat?: boolean;
  }) => Promise<DigestSendResult>,
  args: {
    phone: string;
    message: string;
    captureGroupChatId: string | null;
  },
): Promise<DigestSendResult> {
  let last: DigestSendResult = { sent: false };

  // 1) CallMeBot / non-self Green (sendReply resolves personal + env CallMeBot key).
  const ring = await send({
    toPhone: args.phone,
    message: args.message,
    sameChat: false,
  });
  if (ring.sent) return ring;
  last = ring;

  // 2) Capture group when configured (may fail on free Green quota / yellowCard).
  const groupId = args.captureGroupChatId?.trim();
  if (groupId?.endsWith("@g.us")) {
    const group = await send({
      toPhone: args.phone,
      message: args.message,
      chatId: groupId,
      sameChat: true,
    });
    if (group.sent) return group;
    last = group;
  }

  // 3) Message Yourself — allowed on Green free-tier QUOTE_ALLOWED for the instance phone.
  const selfChatId = digestPersonalChatId(args.phone);
  const self = await send({
    toPhone: args.phone,
    message: args.message,
    chatId: selfChatId,
    sameChat: true,
  });
  if (self.sent) return self;
  return self.reason ? self : last;
}

const DEFAULT_DIGEST_HOUR = 9;
const DIGEST_ITEM_CAP = 40;
/** Cap WhatsApp digest retries per hour so permanent failures don't burn every cron tick. */
const MAX_DIGEST_WA_ATTEMPTS = 3;

type DigestItem = {
  kind: "task" | "notebook" | "list";
  title: string;
  fireAt: string;
  tags: string[];
};

const digestItemValidator = v.object({
  kind: v.union(
    v.literal("task"),
    v.literal("notebook"),
    v.literal("list"),
  ),
  title: v.string(),
  fireAt: v.string(),
  tags: v.array(v.string()),
});

function normalizeDigestTags(tags: string[] | undefined): string[] {
  if (!tags?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const cleaned = raw.trim().replace(/^#+/, "");
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function formatDigestItemTags(tags: string[]): string {
  const normalized = normalizeDigestTags(tags);
  if (!normalized.length) return "";
  return ` [${normalized.map((tag) => `#${tag}`).join(" ")}]`;
}


type DueCandidate =
  | {
      kind: "task";
      taskId: Id<"tasks">;
      userId: Id<"users">;
      title: string;
      dueDate: string | null;
      fireAt: string;
      metadata: unknown;
    }
  | {
      kind: "notebook";
      notebookId: Id<"notebooks">;
      userId: Id<"users">;
      title: string;
      dueDate: string | null;
      fireAt: string;
      metadata: unknown;
    }
  | {
      kind: "list";
      listId: Id<"taskLists">;
      userId: Id<"users">;
      title: string;
      fireAt: string;
    };

function resolveNotifyAt(item: {
  isTask: boolean;
  dueDate: string | null | undefined;
  metadata: unknown;
}): string | null {
  return computeNotifyAt(item);
}

function isActiveReminderStatus(status: string): boolean {
  return status === "inbox" || status === "pending";
}

function formatDueLabel(dueDate: string | null): string | null {
  if (!dueDate) return null;
  try {
    return new Date(dueDate).toLocaleString("he-IL", {
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function localHour(parts: { hour: number }): number {
  return parts.hour === 24 ? 0 : parts.hour;
}

function localDateKey(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function isSameLocalDay(iso: string, now: Date, timeZone: string): boolean {
  const fireMs = Date.parse(iso);
  if (!Number.isFinite(fireMs)) return false;
  const fireParts = getZonedParts(new Date(fireMs), timeZone);
  const nowParts = getZonedParts(now, timeZone);
  return (
    fireParts.year === nowParts.year &&
    fireParts.month === nowParts.month &&
    fireParts.day === nowParts.day
  );
}

/** Israel "ימי חול": Sunday–Thursday (JS weekday 0–4 in Asia/Jerusalem). */
function isDigestDayAllowed(
  weekday: number,
  mode: "weekdays" | "everyday" | undefined,
): boolean {
  if (mode === "weekdays") {
    return weekday >= 0 && weekday <= 4;
  }
  return true;
}

function resolveDigestHours(
  hours: number[] | undefined,
  legacyHour: number | undefined,
): number[] {
  const source =
    Array.isArray(hours) && hours.length > 0
      ? hours
      : typeof legacyHour === "number"
        ? [legacyHour]
        : [DEFAULT_DIGEST_HOUR];
  const unique = [
    ...new Set(
      source.filter(
        (hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23,
      ),
    ),
  ].sort((a, b) => a - b);
  return unique.length > 0 ? unique.slice(0, 3) : [DEFAULT_DIGEST_HOUR];
}

function digestSlotKey(digestDate: string, hour: number): string {
  return `${digestDate}:${hour}`;
}

function formatTimeLabel(iso: string): string {
  try {
    const parts = getZonedParts(new Date(iso), DIGEST_TIMEZONE);
    return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function formatDigestDateLabel(digestDate: string): string {
  const [year, month, day] = digestDate.split("-");
  if (!year || !month || !day) return digestDate;
  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
}

function buildDigestMessage(items: DigestItem[], digestDate: string): string {
  const dateLabel = formatDigestDateLabel(digestDate);
  const header = `הודעה יומית (${dateLabel}) ממערכת BabaiTk`;
  if (items.length === 0) {
    return `${header}\n\nאין תזכורות מתוזמנות להיום.`;
  }

  // Deduplicate + sort so the daily WhatsApp is always a single consolidated list.
  const seen = new Set<string>();
  const unique = items
    .slice()
    .sort((a, b) => a.fireAt.localeCompare(b.fireAt))
    .filter((item) => {
      const key = `${item.kind}|${item.title}|${item.fireAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const lines = unique.slice(0, DIGEST_ITEM_CAP).map((item, index) => {
    const time = formatTimeLabel(item.fireAt) || "00:00";
    const tags = formatDigestItemTags(item.tags);
    return `${index + 1}. ${item.title}${tags} — ${time}`;
  });
  const extra =
    unique.length > DIGEST_ITEM_CAP
      ? `\n…ועוד ${unique.length - DIGEST_ITEM_CAP} תזכורות`
      : "";
  return `${header}\n\n` + lines.join("\n") + extra;
}

/** Compare absolute instants — never lexicographic ISO (offsets vs Z break string compare). */
function isDueAtOrBefore(fireAt: string, nowMs: number): boolean {
  const fireMs = Date.parse(fireAt);
  return Number.isFinite(fireMs) && fireMs <= nowMs;
}

function buildMessage(title: string, dueDate: string | null): { title: string; body: string } {
  const dueLabel = formatDueLabel(dueDate);
  const body =
    (dueLabel ? `מועד יעד: ${dueLabel}\n` : "") + "פתח את BabaiTk לפרטים.";
  return {
    title: `תזכורת: ${title}`,
    body,
  };
}

function buildWhatsAppReminderMessage(
  title: string,
  dueDate: string | null,
  kind: "task" | "notebook" | "list",
): string {
  const dueLabel = formatDueLabel(dueDate);
  const kindLabel =
    kind === "list" ? "רשימה" : kind === "notebook" ? "הערה" : "משימה";
  const lines = [
    `⏰ תזכורת ${kindLabel} מ-BabaiTk`,
    "",
    title,
  ];
  if (dueLabel) lines.push(`מועד: ${dueLabel}`);
  lines.push("", "סיים או עדכן באפליקציה / באתר.");
  return lines.join("\n");
}

/** Keep advancing recurring reminders until the next fire is in the future. */
function advancePastDueReminder(
  item: { due_date?: string | null; metadata?: unknown },
  firedAt: string,
): { due_date?: string | null; metadata: Record<string, unknown> } {
  const nowMs = Date.now();
  let after = buildAfterReminderSentPatch(item, { firedAt });
  // Cap iterations so a bad recurrence rule cannot loop forever.
  for (let i = 0; i < 400; i++) {
    if (!after.due_date || !isDueAtOrBefore(after.due_date, nowMs)) break;
    after = buildAfterReminderSentPatch(
      { due_date: after.due_date, metadata: after.metadata },
      { firedAt: after.due_date },
    );
  }
  return after;
}

export const collectDueCandidates = internalQuery({
  args: {
    nowIso: v.string(),
  },
  returns: v.array(
    v.union(
      v.object({
        kind: v.literal("task"),
        taskId: v.id("tasks"),
        userId: v.id("users"),
        title: v.string(),
        dueDate: v.union(v.string(), v.null()),
        fireAt: v.string(),
        metadata: v.any(),
      }),
      v.object({
        kind: v.literal("notebook"),
        notebookId: v.id("notebooks"),
        userId: v.id("users"),
        title: v.string(),
        dueDate: v.union(v.string(), v.null()),
        fireAt: v.string(),
        metadata: v.any(),
      }),
      v.object({
        kind: v.literal("list"),
        listId: v.id("taskLists"),
        userId: v.id("users"),
        title: v.string(),
        fireAt: v.string(),
      }),
    ),
  ),
  handler: async (ctx, { nowIso }) => {
    const nowMs = Date.parse(nowIso);
    const candidates: DueCandidate[] = [];
    const userNotifyCache = new Map<
      Id<"users">,
      { notifyInApp: boolean; notifyWhatsApp: boolean; notifyWhatsAppGroup: boolean }
    >();

    async function userAllowsNotify(userId: Id<"users">): Promise<boolean> {
      const cached = userNotifyCache.get(userId);
      if (cached) {
        return (
          cached.notifyInApp !== false ||
          cached.notifyWhatsApp !== false ||
          cached.notifyWhatsAppGroup === true
        );
      }
      const user = await ctx.db.get(userId);
      if (!user) return false;
      userNotifyCache.set(userId, {
        notifyInApp: user.notifyInApp !== false,
        notifyWhatsApp: user.notifyWhatsApp !== false,
        notifyWhatsAppGroup: user.notifyWhatsAppGroup === true,
      });
      return (
        user.notifyInApp !== false ||
        user.notifyWhatsApp !== false ||
        user.notifyWhatsAppGroup === true
      );
    }

    const dueTasks = await ctx.db
      .query("tasks")
      .withIndex("by_notify_at", (q) =>
        q.gt("notifyAt", "").lte("notifyAt", nowIso),
      )
      .take(200);

    for (const task of dueTasks) {
      if (task.deletedAt) continue;
      if (task.status !== "inbox" && task.status !== "pending") continue;
      if (!(await userAllowsNotify(task.userId))) continue;

      const fireAt =
        task.notifyAt ??
        resolveNotifyAt({
          isTask: true,
          dueDate: task.dueDate,
          metadata: task.metadata,
        });
      if (!fireAt || !isDueAtOrBefore(fireAt, nowMs)) continue;

      candidates.push({
        kind: "task",
        taskId: task._id,
        userId: task.userId,
        title: task.title,
        dueDate: task.dueDate,
        fireAt,
        metadata: task.metadata,
      });
    }

    const dueNotebooks = await ctx.db
      .query("notebooks")
      .withIndex("by_notify_at", (q) =>
        q.gt("notifyAt", "").lte("notifyAt", nowIso),
      )
      .take(200);

    for (const notebook of dueNotebooks) {
      if (notebook.deletedAt) continue;
      if (notebook.status !== "inbox" && notebook.status !== "pending") continue;
      if (!(await userAllowsNotify(notebook.userId))) continue;

      const fireAt =
        notebook.notifyAt ??
        resolveNotifyAt({
          isTask: false,
          dueDate: notebook.dueDate ?? null,
          metadata: notebook.metadata,
        });
      if (!fireAt || !isDueAtOrBefore(fireAt, nowMs)) continue;

      candidates.push({
        kind: "notebook",
        notebookId: notebook._id,
        userId: notebook.userId,
        title: notebook.title,
        dueDate: notebook.dueDate ?? null,
        fireAt,
        metadata: notebook.metadata,
      });
    }

    const dueLists = await ctx.db
      .query("taskLists")
      .withIndex("by_reminder_at", (q) =>
        q.gt("reminderAt", "").lte("reminderAt", nowIso),
      )
      .take(100);

    for (const list of dueLists) {
      if (list.deletedAt) continue;
      if (!list.reminderAt || !isDueAtOrBefore(list.reminderAt, nowMs)) continue;
      if (!(await userAllowsNotify(list.userId))) continue;
      candidates.push({
        kind: "list",
        listId: list._id,
        userId: list.userId,
        title: list.name,
        fireAt: list.reminderAt,
      });
    }

    return candidates;
  },
});

export const getUserNotifyContext = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      phone: v.union(v.string(), v.null()),
      phoneVerified: v.boolean(),
      notifyInApp: v.boolean(),
      notifyWhatsApp: v.boolean(),
      notifyWhatsAppGroup: v.boolean(),
      captureGroupChatId: v.union(v.string(), v.null()),
      hasCallMeBotKey: v.boolean(),
      pushTokens: v.array(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(20);
    const captureGroupChatId = user.whatsappCaptureGroupChatId?.trim() || null;
    return {
      phone: user.phone ?? null,
      phoneVerified: user.phoneVerified === true,
      notifyInApp: user.notifyInApp !== false,
      notifyWhatsApp: user.notifyWhatsApp !== false,
      notifyWhatsAppGroup: user.notifyWhatsAppGroup === true,
      captureGroupChatId,
      hasCallMeBotKey: Boolean(user.callMeBotApiKey?.trim()),
      pushTokens: tokens.map((t) => t.token),
    };
  },
});

export const createInAppNotification = internalMutation({
  args: {
    userId: v.id("users"),
    kind: v.union(v.literal("item_reminder"), v.literal("list_reminder")),
    title: v.string(),
    body: v.string(),
    taskId: v.optional(v.id("tasks")),
    notebookId: v.optional(v.id("notebooks")),
    listId: v.optional(v.id("taskLists")),
    fireAt: v.string(),
    dedupeKey: v.string(),
  },
  returns: v.union(v.id("notifications"), v.null()),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_user_dedupe", (q) =>
        q.eq("userId", args.userId).eq("dedupeKey", args.dedupeKey),
      )
      .unique();
    if (existing) return null;

    return await ctx.db.insert("notifications", {
      userId: args.userId,
      kind: args.kind,
      title: args.title,
      body: args.body,
      taskId: args.taskId,
      notebookId: args.notebookId,
      listId: args.listId,
      fireAt: args.fireAt,
      dedupeKey: args.dedupeKey,
      read: false,
      createdAt: Date.now(),
    });
  },
});

export const markItemReminderFired = internalMutation({
  args: {
    kind: v.union(v.literal("task"), v.literal("notebook"), v.literal("list")),
    taskId: v.optional(v.id("tasks")),
    notebookId: v.optional(v.id("notebooks")),
    listId: v.optional(v.id("taskLists")),
    fireAt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.kind === "list" && args.listId) {
      await ctx.db.patch(args.listId, {
        reminderAt: null,
        updatedAt: Date.now(),
      });
      return null;
    }

    if (args.kind === "task" && args.taskId) {
      const task = await ctx.db.get(args.taskId);
      if (!task) return null;
      const after = advancePastDueReminder(
        { due_date: task.dueDate, metadata: task.metadata },
        args.fireAt,
      );
      const nextDue = after.due_date !== undefined ? after.due_date : task.dueDate;
      const nextMeta = after.metadata;
      await ctx.db.patch(args.taskId, {
        dueDate: nextDue,
        metadata: nextMeta,
        notifyAt: notifyAtPatchValue({
          isTask: true,
          dueDate: nextDue,
          metadata: nextMeta,
        }, !isActiveReminderStatus(task.status)),
        updatedAt: Date.now(),
      });
      return null;
    }

    if (args.kind === "notebook" && args.notebookId) {
      const notebook = await ctx.db.get(args.notebookId);
      if (!notebook) return null;
      const after = advancePastDueReminder(
        { due_date: notebook.dueDate ?? null, metadata: notebook.metadata },
        args.fireAt,
      );
      const nextDue = after.due_date !== undefined ? after.due_date : notebook.dueDate;
      const nextMeta = after.metadata;
      await ctx.db.patch(args.notebookId, {
        dueDate: nextDue,
        metadata: nextMeta,
        notifyAt: notifyAtPatchValue({
          isTask: false,
          dueDate: nextDue,
          metadata: nextMeta,
        }, !isActiveReminderStatus(notebook.status)),
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const sendExpoPush = internalAction({
  args: {
    tokens: v.array(v.string()),
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
  },
  returns: v.object({
    sent: v.number(),
  }),
  handler: async (_ctx, args) => {
    if (args.tokens.length === 0) return { sent: 0 };

    const messages = args.tokens.map((to) => ({
      to,
      sound: "default" as const,
      priority: "high" as const,
      channelId: "reminders",
      title: args.title,
      body: args.body,
      data: args.data ?? {},
      ttl: 60 * 60,
      expiration: Math.floor(Date.now() / 1000) + 60 * 60,
      _contentAvailable: true,
    }));

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });
      const payloadText = await response.text().catch(() => "");
      if (!response.ok) {
        console.warn(
          `[reminders] Expo push HTTP ${response.status}: ${payloadText.slice(0, 240)}`,
        );
        return { sent: 0 };
      }
      try {
        const parsed = JSON.parse(payloadText) as {
          data?: Array<{ status?: string; message?: string }>;
        };
        const rows = Array.isArray(parsed.data) ? parsed.data : [];
        const okCount = rows.filter((row) => row.status === "ok").length;
        const errors = rows
          .filter((row) => row.status && row.status !== "ok")
          .map((row) => row.message ?? row.status)
          .slice(0, 3);
        if (errors.length > 0) {
          console.warn(`[reminders] Expo push ticket errors: ${errors.join("; ")}`);
        }
        return { sent: okCount > 0 ? okCount : messages.length };
      } catch {
        return { sent: messages.length };
      }
    } catch (error) {
      console.warn(
        `[reminders] Expo push failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { sent: 0 };
    }
  },
});

/**
 * Cron entry: create in-app notifications, optional Expo push + WhatsApp.
 */
export const dispatchDue = internalAction({
  args: {},
  returns: v.object({
    scanned: v.number(),
    notified: v.number(),
  }),
  handler: async (ctx) => {
    const nowIso = new Date().toISOString();
    const candidates: DueCandidate[] = await ctx.runQuery(
      internal.reminders.collectDueCandidates,
      { nowIso },
    );

    let notified = 0;

    for (const candidate of candidates) {
      try {
        const userCtx = await ctx.runQuery(internal.reminders.getUserNotifyContext, {
          userId: candidate.userId,
        });
        if (!userCtx) continue;

        const dueDate =
          candidate.kind === "list" ? candidate.fireAt : candidate.dueDate;
        const copy = buildMessage(candidate.title, dueDate);

        const dedupeKey =
          candidate.kind === "task"
            ? `task:${candidate.taskId}:${candidate.fireAt}`
            : candidate.kind === "notebook"
              ? `notebook:${candidate.notebookId}:${candidate.fireAt}`
              : `list:${candidate.listId}:${candidate.fireAt}`;

        let delivered = false;
        // First successful claim of this fireAt (new in-app row, or no in-app channel).
        let firstDelivery = false;

        if (userCtx.notifyInApp) {
          // null = already exists for this fireAt; both count as delivered.
          const created = await ctx.runMutation(
            internal.reminders.createInAppNotification,
            {
              userId: candidate.userId,
              kind: candidate.kind === "list" ? "list_reminder" : "item_reminder",
              title: copy.title,
              body: copy.body,
              taskId: candidate.kind === "task" ? candidate.taskId : undefined,
              notebookId:
                candidate.kind === "notebook" ? candidate.notebookId : undefined,
              listId: candidate.kind === "list" ? candidate.listId : undefined,
              fireAt: candidate.fireAt,
              dedupeKey,
            },
          );
          delivered = true;
          firstDelivery = created !== null;

          // Only push for a brand-new row. If the row already exists for this
          // fireAt, the push already went out — never re-push on a later scan.
          if (created !== null && userCtx.pushTokens.length > 0) {
            const push = await ctx.runAction(internal.reminders.sendExpoPush, {
              tokens: userCtx.pushTokens,
              title: copy.title,
              body: copy.body,
              data: {
                kind: candidate.kind,
                taskId: candidate.kind === "task" ? candidate.taskId : undefined,
                notebookId:
                  candidate.kind === "notebook" ? candidate.notebookId : undefined,
                listId: candidate.kind === "list" ? candidate.listId : undefined,
              },
            });
            if (push.sent > 0) delivered = true;
          }
        } else if (userCtx.notifyWhatsApp || userCtx.notifyWhatsAppGroup) {
          // No in-app channel — this scan is the first attempt for this fireAt
          // until we mark it fired below.
          firstDelivery = true;
          delivered = true;
        }

        if (
          firstDelivery &&
          userCtx.notifyWhatsAppGroup &&
          userCtx.phoneVerified &&
          userCtx.phone &&
          userCtx.captureGroupChatId
        ) {
          try {
            const waMessage = buildWhatsAppReminderMessage(
              candidate.title,
              dueDate,
              candidate.kind,
            );
            const wa = await ctx.runAction(internal.whatsappSend.sendReply, {
              toPhone: userCtx.phone,
              message: waMessage,
              chatId: userCtx.captureGroupChatId,
              sameChat: true,
            });
            if (wa.sent) {
              delivered = true;
            } else {
              console.warn(
                `[reminders] WhatsApp group reminder not sent for ${candidate.kind}: ${
                  wa.reason ?? "unknown"
                }`,
              );
            }
          } catch (error) {
            console.warn(
              `[reminders] WhatsApp group reminder failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }

        if (!delivered) continue;

        await ctx.runMutation(internal.reminders.markItemReminderFired, {
          kind: candidate.kind,
          taskId: candidate.kind === "task" ? candidate.taskId : undefined,
          notebookId:
            candidate.kind === "notebook" ? candidate.notebookId : undefined,
          listId: candidate.kind === "list" ? candidate.listId : undefined,
          fireAt: candidate.fireAt,
        });

        notified += 1;
      } catch (error) {
        console.warn(
          `[reminders] dispatchDue failed for ${candidate.kind}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { scanned: candidates.length, notified };
  },
});

// --- Overdue nags: repeat notification for open items whose reminder passed ---

const DEFAULT_OVERDUE_FIRST_HOURS = 24;
const DEFAULT_OVERDUE_REPEAT_HOURS = 48;
const OVERDUE_NAG_CAP_PER_RUN = 100;
const HOUR_MS = 60 * 60 * 1000;

function resolveOverdueTiming(user: {
  overdueFirstHours?: number;
  overdueRepeatHours?: number;
}): { firstHours: number; repeatHours: number } {
  const first =
    typeof user.overdueFirstHours === "number" &&
    Number.isFinite(user.overdueFirstHours) &&
    user.overdueFirstHours >= 1
      ? Math.min(168, Math.floor(user.overdueFirstHours))
      : DEFAULT_OVERDUE_FIRST_HOURS;
  const repeat =
    typeof user.overdueRepeatHours === "number" &&
    Number.isFinite(user.overdueRepeatHours) &&
    user.overdueRepeatHours >= 1
      ? Math.min(168, Math.floor(user.overdueRepeatHours))
      : DEFAULT_OVERDUE_REPEAT_HOURS;
  return { firstHours: first, repeatHours: repeat };
}

/**
 * Nag slot index for an overdue item: slot 0 fires after `firstHours`,
 * then a new slot every `repeatHours`. Returns null while not yet due.
 */
function overdueNagSlot(
  fireMs: number,
  nowMs: number,
  firstHours: number,
  repeatHours: number,
): number | null {
  const over = nowMs - fireMs;
  const firstMs = firstHours * HOUR_MS;
  const repeatMs = Math.max(1, repeatHours) * HOUR_MS;
  if (over < firstMs) return null;
  return Math.floor((over - firstMs) / repeatMs);
}

function formatOverdueLabel(fireMs: number, nowMs: number): string {
  const hours = Math.floor((nowMs - fireMs) / (60 * 60 * 1000));
  if (hours < 48) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  return `לפני ${days} ימים`;
}

type OverdueNagCandidate = {
  kind: "task" | "notebook";
  taskId?: Id<"tasks">;
  notebookId?: Id<"notebooks">;
  userId: Id<"users">;
  title: string;
  fireAt: string;
  fireMs: number;
  slot: number;
};

export const collectOverdueNagCandidates = internalQuery({
  args: {
    nowIso: v.string(),
  },
  returns: v.array(
    v.object({
      kind: v.union(v.literal("task"), v.literal("notebook")),
      taskId: v.optional(v.id("tasks")),
      notebookId: v.optional(v.id("notebooks")),
      userId: v.id("users"),
      title: v.string(),
      fireAt: v.string(),
      fireMs: v.number(),
      slot: v.number(),
    }),
  ),
  handler: async (ctx, { nowIso }) => {
    const nowMs = Date.parse(nowIso);
    if (!Number.isFinite(nowMs)) return [];

    const out: OverdueNagCandidate[] = [];
    const users = await ctx.db.query("users").take(500);

    for (const user of users) {
      if (user.notifyOverdueReminders === false) continue;
      if (user.notifyInApp === false) continue;

      const { firstHours, repeatHours } = resolveOverdueTiming(user);
      const statuses = ["inbox", "pending"] as const;

      for (const status of statuses) {
        const tasks = await ctx.db
          .query("tasks")
          .withIndex("by_user_status", (q) =>
            q.eq("userId", user._id).eq("status", status),
          )
          .take(200);
        for (const task of tasks) {
          if (out.length >= OVERDUE_NAG_CAP_PER_RUN) return out;
          if (task.deletedAt) continue;
          if (getReminderFlags(task.metadata).disabled) continue;
          if (!task.dueDate) continue;
          const fireMs = Date.parse(task.dueDate);
          if (!Number.isFinite(fireMs)) continue;
          const slot = overdueNagSlot(fireMs, nowMs, firstHours, repeatHours);
          if (slot === null) continue;
          out.push({
            kind: "task",
            taskId: task._id,
            userId: user._id,
            title: task.title,
            fireAt: new Date(fireMs).toISOString(),
            fireMs,
            slot,
          });
        }

        const notebooks = await ctx.db
          .query("notebooks")
          .withIndex("by_user_status", (q) =>
            q.eq("userId", user._id).eq("status", status),
          )
          .take(200);
        for (const notebook of notebooks) {
          if (out.length >= OVERDUE_NAG_CAP_PER_RUN) return out;
          if (notebook.deletedAt) continue;
          if (getReminderFlags(notebook.metadata).disabled) continue;
          if (!notebook.dueDate) continue;
          const fireMs = Date.parse(notebook.dueDate);
          if (!Number.isFinite(fireMs)) continue;
          const slot = overdueNagSlot(fireMs, nowMs, firstHours, repeatHours);
          if (slot === null) continue;
          out.push({
            kind: "notebook",
            notebookId: notebook._id,
            userId: user._id,
            title: notebook.title,
            fireAt: new Date(fireMs).toISOString(),
            fireMs,
            slot,
          });
        }
      }
    }

    return out;
  },
});

/**
 * Cron entry: repeat-notify open items past their reminder time.
 * Timing per user (defaults 24h then every 48h) — deduped per slot,
 * so each window notifies exactly once no matter how often the cron runs.
 */
export const dispatchOverdueNags = internalAction({
  args: {},
  returns: v.object({
    scanned: v.number(),
    notified: v.number(),
  }),
  handler: async (ctx) => {
    const nowIso = new Date().toISOString();
    const nowMs = Date.parse(nowIso);
    const candidates: OverdueNagCandidate[] = await ctx.runQuery(
      internal.reminders.collectOverdueNagCandidates,
      { nowIso },
    );

    let notified = 0;

    for (const candidate of candidates) {
      try {
        const targetId =
          candidate.kind === "task" ? candidate.taskId : candidate.notebookId;
        const dedupeKey = `overdue:${candidate.kind}:${targetId}:${candidate.fireAt}:${candidate.slot}`;
        const overdueLabel = formatOverdueLabel(candidate.fireMs, nowMs);
        const title = `תזכורת חוזרת: ${candidate.title}`;
        const body = `מועד ההתראה עבר ${overdueLabel} והפריט עדיין פתוח.\nסיים או עדכן את המועד ב-BabaiTk.`;

        const created = await ctx.runMutation(
          internal.reminders.createInAppNotification,
          {
            userId: candidate.userId,
            kind: "item_reminder",
            title,
            body,
            taskId: candidate.kind === "task" ? candidate.taskId : undefined,
            notebookId:
              candidate.kind === "notebook" ? candidate.notebookId : undefined,
            fireAt: nowIso,
            dedupeKey,
          },
        );
        if (created === null) continue; // Slot already notified.

        notified += 1;

        const userCtx = await ctx.runQuery(internal.reminders.getUserNotifyContext, {
          userId: candidate.userId,
        });
        if (userCtx && userCtx.pushTokens.length > 0) {
          await ctx.runAction(internal.reminders.sendExpoPush, {
            tokens: userCtx.pushTokens,
            title,
            body,
            data: {
              kind: "overdue_reminder",
              taskId: candidate.kind === "task" ? candidate.taskId : undefined,
              notebookId:
                candidate.kind === "notebook" ? candidate.notebookId : undefined,
            },
          });
        }
      } catch (error) {
        console.warn(
          `[reminders] dispatchOverdueNags failed for ${candidate.kind}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { scanned: candidates.length, notified };
  },
});

/**
 * Users whose local hour matches their digest setting, with today's reminders.
 * Empty `items` still returned so callers can mark the day done (no spam).
 */
export const collectDailyDigestCandidates = internalQuery({
  args: {
    nowIso: v.string(),
  },
  returns: v.array(
    v.object({
      userId: v.id("users"),
      phone: v.string(),
      captureGroupChatId: v.union(v.string(), v.null()),
      digestDate: v.string(),
      hour: v.number(),
      items: v.array(digestItemValidator),
    }),
  ),
  handler: async (ctx, { nowIso }) => {
    const now = new Date(nowIso);
    if (Number.isNaN(now.getTime())) return [];

    const nowParts = getZonedParts(now, DIGEST_TIMEZONE);
    const hour = localHour(nowParts);
    const digestDate = localDateKey(nowParts);
    const slotKey = digestSlotKey(digestDate, hour);
    const users = await ctx.db.query("users").take(500);
    const out: Array<{
      userId: Id<"users">;
      phone: string;
      captureGroupChatId: string | null;
      digestDate: string;
      hour: number;
      items: DigestItem[];
    }> = [];

    for (const user of users) {
      if (!user.phone || user.phoneVerified !== true) continue;
      if (user.notifyWhatsApp === false) continue;
      const digestHours = resolveDigestHours(
        user.whatsappDigestHours,
        user.whatsappDigestHour,
      );
      if (!digestHours.includes(hour)) continue;
      if (!isDigestDayAllowed(nowParts.weekday, user.whatsappDigestDays)) continue;
      const sentSlots = user.lastWhatsAppDigestSlots ?? [];
      if (sentSlots.includes(slotKey)) continue;
      if (
        user.lastWhatsAppDigestFailSlot === slotKey &&
        (user.lastWhatsAppDigestFailCount ?? 0) >= MAX_DIGEST_WA_ATTEMPTS
      ) {
        continue;
      }

      const items: DigestItem[] = [];

      const inbox = await ctx.db
        .query("tasks")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", user._id).eq("status", "inbox"),
        )
        .take(200);
      const pending = await ctx.db
        .query("tasks")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", user._id).eq("status", "pending"),
        )
        .take(200);

      for (const task of [...inbox, ...pending]) {
        if (task.deletedAt) continue;
        const fireAt = resolveNotifyAt({
          isTask: true,
          dueDate: task.dueDate,
          metadata: task.metadata,
        });
        if (!fireAt || !isSameLocalDay(fireAt, now, DIGEST_TIMEZONE)) continue;
        items.push({
          kind: "task",
          title: task.title,
          fireAt,
          tags: normalizeDigestTags(task.tags),
        });
      }

      const notebookInbox = await ctx.db
        .query("notebooks")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", user._id).eq("status", "inbox"),
        )
        .take(200);
      const notebookPending = await ctx.db
        .query("notebooks")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", user._id).eq("status", "pending"),
        )
        .take(200);
      for (const notebook of [...notebookInbox, ...notebookPending]) {
        if (notebook.deletedAt) continue;
        const fireAt = resolveNotifyAt({
          isTask: false,
          dueDate: notebook.dueDate ?? null,
          metadata: notebook.metadata,
        });
        if (!fireAt || !isSameLocalDay(fireAt, now, DIGEST_TIMEZONE)) continue;
        items.push({
          kind: "notebook",
          title: notebook.title,
          fireAt,
          tags: normalizeDigestTags(notebook.tags),
        });
      }

      const lists = await ctx.db
        .query("taskLists")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", user._id).eq("status", "active"),
        )
        .take(100);
      for (const list of lists) {
        if (list.deletedAt) continue;
        if (!list.reminderAt) continue;
        if (!isSameLocalDay(list.reminderAt, now, DIGEST_TIMEZONE)) continue;
        items.push({
          kind: "list",
          title: list.name,
          fireAt: list.reminderAt,
          tags: [],
        });
      }

      items.sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt));
      out.push({
        userId: user._id,
        phone: user.phone,
        captureGroupChatId: user.whatsappCaptureGroupChatId
          ? user.whatsappCaptureGroupChatId.trim()
          : null,
        digestDate,
        hour,
        items,
      });
    }

    return out;
  },
});

export const markWhatsAppDigestSent = internalMutation({
  args: {
    userId: v.id("users"),
    digestDate: v.string(),
    hour: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, digestDate, hour }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const slotKey = digestSlotKey(digestDate, hour);
    const existing = user.lastWhatsAppDigestSlots ?? [];
    const kept = existing.filter((slot) => slot.startsWith(`${digestDate}:`));
    if (!kept.includes(slotKey)) kept.push(slotKey);
    await ctx.db.patch(userId, {
      lastWhatsAppDigestSlots: kept,
      lastWhatsAppDigestDate: digestDate,
      lastWhatsAppDigestFailSlot: undefined,
      lastWhatsAppDigestFailCount: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Record a failed WhatsApp digest attempt; returns whether the slot is exhausted. */
export const recordWhatsAppDigestFailure = internalMutation({
  args: {
    userId: v.id("users"),
    digestDate: v.string(),
    hour: v.number(),
  },
  returns: v.object({
    attempts: v.number(),
    exhausted: v.boolean(),
  }),
  handler: async (ctx, { userId, digestDate, hour }) => {
    const user = await ctx.db.get(userId);
    if (!user) return { attempts: 0, exhausted: true };
    const slotKey = digestSlotKey(digestDate, hour);
    const prev =
      user.lastWhatsAppDigestFailSlot === slotKey
        ? (user.lastWhatsAppDigestFailCount ?? 0)
        : 0;
    const attempts = prev + 1;
    await ctx.db.patch(userId, {
      lastWhatsAppDigestFailSlot: slotKey,
      lastWhatsAppDigestFailCount: attempts,
      updatedAt: Date.now(),
    });
    return {
      attempts,
      exhausted: attempts >= MAX_DIGEST_WA_ATTEMPTS,
    };
  },
});

/** Ops: clear digest slots so the next cron / force-send can retry WhatsApp. */
export const clearWhatsAppDigestSlots = internalMutation({
  args: {
    email: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    cleared: v.number(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const email = (args.email ?? "erezbabayan@gmail.com").trim().toLowerCase();
    const users = await ctx.db.query("users").take(500);
    const user = users.find((row) => (row.email ?? "").toLowerCase() === email);
    if (!user) return { ok: false, cleared: 0, reason: "user_not_found" };
    const cleared = user.lastWhatsAppDigestSlots?.length ?? 0;
    await ctx.db.patch(user._id, {
      lastWhatsAppDigestSlots: [],
      updatedAt: Date.now(),
    });
    return { ok: true, cleared };
  },
});

/**
 * Cron entry: at each user's chosen hour(s), WhatsApp today's reminder list.
 */
type DigestCandidate = {
  userId: Id<"users">;
  phone: string;
  captureGroupChatId: string | null;
  digestDate: string;
  hour: number;
  items: DigestItem[];
};

export const dispatchDailyDigests = internalAction({
  args: {},
  returns: v.object({
    scanned: v.number(),
    sent: v.number(),
  }),
  handler: async (ctx): Promise<{ scanned: number; sent: number }> => {
    const nowIso = new Date().toISOString();
    const candidates: DigestCandidate[] = await ctx.runQuery(
      internal.reminders.collectDailyDigestCandidates,
      { nowIso },
    );

    let sent = 0;

    for (const candidate of candidates) {
      const message = buildDigestMessage(candidate.items, candidate.digestDate);
      const userCtx = await ctx.runQuery(internal.reminders.getUserNotifyContext, {
        userId: candidate.userId,
      });

      let inAppDelivered = false;
      let waSent = false;

      const alertTitle = `הודעה יומית (${formatDigestDateLabel(candidate.digestDate)}) ממערכת BabaiTk`;
      const alertBody =
        candidate.items.length === 0
          ? "אין תזכורות להיום"
          : `${candidate.items.length} תזכורות — פתח את WhatsApp / BabaiTk`;

      if (userCtx?.notifyInApp !== false) {
        const created = await ctx.runMutation(internal.reminders.createInAppNotification, {
          userId: candidate.userId,
          kind: "item_reminder",
          title: alertTitle,
          body: alertBody,
          fireAt: `${candidate.digestDate}T${String(candidate.hour).padStart(2, "0")}:00:00`,
          dedupeKey: `digest:${candidate.userId}:${candidate.digestDate}:${candidate.hour}`,
        });
        // Row exists for this slot either way (created OR already there) → delivered.
        inAppDelivered = true;

        // Only push when the row is NEW. Otherwise the 5-min cron would re-push
        // this same digest on every run whenever the slot stays unmarked.
        if (created !== null && userCtx && userCtx.pushTokens.length > 0) {
          await ctx.runAction(internal.reminders.sendExpoPush, {
            tokens: userCtx.pushTokens,
            title: alertTitle,
            body: alertBody,
            data: {
              kind: "daily_digest",
              digestDate: candidate.digestDate,
              hour: candidate.hour,
              sound: true,
            },
          });
        }
      }

      if (userCtx?.notifyWhatsApp && candidate.phone) {
        try {
          const wa = await deliverDigestWhatsApp(
            (sendArgs) =>
              ctx.runAction(internal.whatsappSend.sendReply, sendArgs),
            {
              phone: candidate.phone,
              message,
              captureGroupChatId: candidate.captureGroupChatId,
            },
          );
          if (wa.sent) {
            waSent = true;
            sent += 1;
          } else {
            const restricted = Boolean(
              wa.reason?.includes("green_api_restricted") ||
                wa.reason?.toLowerCase().includes("yellowcard") ||
                wa.reason?.toLowerCase().includes("suspended"),
            );
            console.warn(
              `[reminders] WhatsApp digest not sent for ${candidate.userId}: ${
                wa.reason ?? "unknown"
              }`,
            );
            if (restricted) {
              // Account-level WhatsApp restriction lasts days — don't retry Green-API.
              // Do NOT mark the digest slot as WhatsApp-sent when only in-app fired
              // (recurring bug: no CallMeBot retry / evening re-send).
              const dayKey = candidate.digestDate;
              await ctx.runMutation(internal.reminders.createInAppNotification, {
                userId: candidate.userId,
                kind: "item_reminder",
                title: "הודעה יומית לא נשלחה לוואטסאפ",
                body:
                  "WhatsApp מגביל שליחות Green-API (yellowCard). הקליטה מהקבוצה ממשיכה דרך סנכרון היסטוריה. להודעה יומית עם צליל — הפעילו CallMeBot בהגדרות וואטסאפ.",
                fireAt: `${candidate.digestDate}T${String(candidate.hour).padStart(2, "0")}:00:00`,
                dedupeKey: `green-restricted-digest:${candidate.userId}:${dayKey}`,
              });
              // Without CallMeBot we cannot deliver WA during yellowCard — stop this
              // hour after the notice (avoids hammering Green-API every 5 minutes).
              // With CallMeBot configured, keep waSent=false so cron retries CallMeBot.
              if (!userCtx.hasCallMeBotKey) {
                waSent = true;
              }
            } else {
              const fail = await ctx.runMutation(
                internal.reminders.recordWhatsAppDigestFailure,
                {
                  userId: candidate.userId,
                  digestDate: candidate.digestDate,
                  hour: candidate.hour,
                },
              );
              const needsCallMeBot =
                wa.reason === "green_api_same_number_use_callmebot" ||
                Boolean(wa.reason?.includes("QUOTE")) ||
                Boolean(wa.reason?.toLowerCase().includes("yellowcard"));
              if (fail.exhausted || needsCallMeBot) {
                const setupTitle = needsCallMeBot
                  ? "להודעות WhatsApp — הפעל CallMeBot"
                  : "הודעה יומית לא נשלחה לוואטסאפ";
                const setupBody = needsCallMeBot
                  ? `Green-API מוגבל / אותו מספר. פתח והשלח: ${CALLMEBOT_ACTIVATE_URL} — אחר כך הדבק APIKEY בהגדרות וואטסאפ.`
                  : `ניסיונות נכשלו (${wa.reason ?? "שגיאה"}). בדוק חיבור וואטסאפ / CallMeBot.`;
                let setupCreated: string | null = null;
                if (userCtx.notifyInApp !== false) {
                  setupCreated = await ctx.runMutation(
                    internal.reminders.createInAppNotification,
                    {
                      userId: candidate.userId,
                      kind: "item_reminder",
                      title: setupTitle,
                      body: setupBody,
                      fireAt: `${candidate.digestDate}T${String(candidate.hour).padStart(2, "0")}:00:00`,
                      dedupeKey: `digest-fail:${candidate.userId}:${candidate.digestDate}:${candidate.hour}`,
                    },
                  );
                }
                // Push only on first setup notice — never every 5-min cron retry.
                if (setupCreated !== null && userCtx.pushTokens.length > 0) {
                  await ctx.runAction(internal.reminders.sendExpoPush, {
                    tokens: userCtx.pushTokens,
                    title: setupTitle,
                    body: setupBody,
                    data: {
                      kind: "daily_digest_failed",
                      digestDate: candidate.digestDate,
                      hour: candidate.hour,
                      sound: true,
                    },
                  });
                }
              }
              if (fail.exhausted) {
                // Stop retrying this hour — mark so collect skips permanently.
                await ctx.runMutation(internal.reminders.markWhatsAppDigestSent, {
                  userId: candidate.userId,
                  digestDate: candidate.digestDate,
                  hour: candidate.hour,
                });
              }
            }
          }
        } catch (error) {
          console.warn(
            `[reminders] WhatsApp digest failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          await ctx.runMutation(internal.reminders.recordWhatsAppDigestFailure, {
            userId: candidate.userId,
            digestDate: candidate.digestDate,
            hour: candidate.hour,
          });
        }
      }

      // When WhatsApp is enabled, only mark the slot after WA succeeds so cron retries.
      // When WhatsApp is off, mark after in-app (or immediately if in-app is also off).
      const shouldMark =
        userCtx?.notifyWhatsApp === true
          ? waSent
          : inAppDelivered || userCtx?.notifyInApp === false;
      if (shouldMark) {
        await ctx.runMutation(internal.reminders.markWhatsAppDigestSent, {
          userId: candidate.userId,
          digestDate: candidate.digestDate,
          hour: candidate.hour,
        });
      }
    }

    return { scanned: candidates.length, sent };
  },
});

export const findUserForWhatsAppTest = internalQuery({
  args: {
    nameContains: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      name: v.union(v.string(), v.null()),
      email: v.union(v.string(), v.null()),
      phone: v.string(),
      phoneVerified: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const needle = (args.nameContains ?? "").trim().toLowerCase();
    const email = (args.email ?? "").trim().toLowerCase();
    const users = await ctx.db.query("users").take(500);
    const match = users.find((user) => {
      if (email && (user.email ?? "").toLowerCase() === email) return true;
      if (!needle) return false;
      const hay = [
        user.name ?? "",
        user.firstName ?? "",
        user.lastName ?? "",
        user.email ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
    if (!match?.phone) return null;
    return {
      userId: match._id,
      name: match.name ?? null,
      email: match.email ?? null,
      phone: match.phone,
      phoneVerified: match.phoneVerified === true,
    };
  },
});

type WhatsAppTestUser = {
  userId: Id<"users">;
  name: string | null;
  email: string | null;
  phone: string;
  phoneVerified: boolean;
};

type WhatsAppTestResult = {
  ok: boolean;
  phone?: string;
  name?: string | null;
    provider?: "green-api" | "meta" | "callmebot";
    reason?: string;
  };

/** Manual test: npx convex run reminders:sendTestWhatsApp '{"nameContains":"בביאן"}' */
export const sendTestWhatsApp = internalAction({
  args: {
    nameContains: v.optional(v.string()),
    email: v.optional(v.string()),
    message: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    phone: v.optional(v.string()),
    name: v.optional(v.union(v.string(), v.null())),
    provider: v.optional(
      v.union(
        v.literal("green-api"),
        v.literal("meta"),
        v.literal("callmebot"),
      ),
    ),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<WhatsAppTestResult> => {
    const user: WhatsAppTestUser | null = await ctx.runQuery(
      internal.reminders.findUserForWhatsAppTest,
      {
        nameContains: args.nameContains,
        email: args.email,
      },
    );
    if (!user) {
      return { ok: false, reason: "user_not_found_or_no_phone" };
    }
    if (!user.phoneVerified) {
      return {
        ok: false,
        phone: user.phone,
        name: user.name,
        reason: "phone_not_verified",
      };
    }

    const message =
      args.message?.trim() ||
      `✓ בדיקת BabaiTk\n\nשלום${user.name ? ` ${user.name}` : ""}, זו הודעת ניסיון לסיכום התזכורות היומי בוואטסאפ.\nאם קיבלת את זה — החיבור עובד.`;

    const result: {
      sent: boolean;
      provider?: "green-api" | "meta" | "callmebot";
      reason?: string;
    } = await ctx.runAction(internal.whatsappSend.sendReply, {
      toPhone: user.phone,
      message,
    });

    const userCtx = await ctx.runQuery(internal.reminders.getUserNotifyContext, {
      userId: user.userId,
    });
    if (userCtx?.notifyInApp !== false) {
      await ctx.runMutation(internal.reminders.createInAppNotification, {
        userId: user.userId,
        kind: "item_reminder",
        title: "בדיקת WhatsApp מ־BabaiTk",
        body: "הודעת בדיקה נשלחה — אם וואטסאפ שקט, זו התראת המערכת",
        fireAt: new Date().toISOString(),
        dedupeKey: `wa-test:${user.userId}:${Date.now()}`,
      });
    }
    if (userCtx && userCtx.pushTokens.length > 0) {
      await ctx.runAction(internal.reminders.sendExpoPush, {
        tokens: userCtx.pushTokens,
        title: "בדיקת WhatsApp מ־BabaiTk",
        body: "הודעת בדיקה נשלחה",
        data: { kind: "whatsapp_test", sound: true },
      });
    }

    return {
      ok: result.sent,
      phone: user.phone,
      name: user.name,
      provider: result.provider,
      reason: result.reason,
    };
  },
});

/** Ops: send CallMeBot “extra sender number” setup instructions to the user. */
export const sendExtraSenderSetup = internalAction({
  args: {
    email: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    phone: v.optional(v.string()),
    activateUrl: v.string(),
    provider: v.optional(
      v.union(
        v.literal("green-api"),
        v.literal("meta"),
        v.literal("callmebot"),
      ),
    ),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    ok: boolean;
    phone?: string;
    activateUrl: string;
    provider?: "green-api" | "meta" | "callmebot";
    reason?: string;
  }> => {
    const email = (args.email ?? "erezbabayan@gmail.com").trim().toLowerCase();
    const user: WhatsAppTestUser | null = await ctx.runQuery(
      internal.reminders.findUserForWhatsAppTest,
      { email },
    );
    if (!user?.phoneVerified) {
      return {
        ok: false,
        activateUrl: CALLMEBOT_ACTIVATE_URL,
        reason: user ? "phone_not_verified" : "user_not_found_or_no_phone",
        phone: user?.phone,
      };
    }

    const result: {
      sent: boolean;
      provider?: "green-api" | "meta" | "callmebot";
      reason?: string;
    } = await ctx.runAction(internal.whatsappSend.sendReply, {
      toPhone: user.phone,
      message: buildCallMeBotSetupMessage(),
    });

    return {
      ok: result.sent,
      phone: user.phone,
      activateUrl: CALLMEBOT_ACTIVATE_URL,
      provider: result.provider,
      reason: result.reason,
    };
  },
});

/** Force-send today's digest WhatsApp now (ignores digest hour / already-sent slot). */
export const forceSendDailyDigest = internalAction({
  args: {
    email: v.optional(v.string()),
    /** Offset in calendar days from today in Asia/Jerusalem (e.g. -1 = yesterday). */
    dayOffset: v.optional(v.number()),
  },
  returns: v.object({
    ok: v.boolean(),
    phone: v.optional(v.string()),
    name: v.optional(v.union(v.string(), v.null())),
    digestDate: v.optional(v.string()),
    itemCount: v.optional(v.number()),
    provider: v.optional(
      v.union(
        v.literal("green-api"),
        v.literal("meta"),
        v.literal("callmebot"),
      ),
    ),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    ok: boolean;
    phone?: string;
    name?: string | null;
    digestDate?: string;
    itemCount?: number;
    provider?: "green-api" | "meta" | "callmebot";
    reason?: string;
  }> => {
    const email = (args.email ?? "erezbabayan@gmail.com").trim().toLowerCase();
    const dayOffset = Number.isFinite(args.dayOffset) ? Math.trunc(args.dayOffset!) : 0;
    const nowIso = new Date().toISOString();
    const payload: {
      userId: Id<"users">;
      name: string | null;
      phone: string;
      captureGroupChatId: string | null;
      digestDate: string;
      items: DigestItem[];
    } | null = await ctx.runQuery(internal.reminders.collectTodayDigestForEmail, {
      email,
      nowIso,
      dayOffset,
    });
    if (!payload) {
      return { ok: false, reason: "user_not_found_or_no_phone" };
    }

    const message = buildDigestMessage(payload.items, payload.digestDate);

    const result = await deliverDigestWhatsApp(
      (sendArgs) => ctx.runAction(internal.whatsappSend.sendReply, sendArgs),
      {
        phone: payload.phone,
        message,
        captureGroupChatId: payload.captureGroupChatId,
      },
    );

    const userCtx = await ctx.runQuery(internal.reminders.getUserNotifyContext, {
      userId: payload.userId,
    });

    const dateLabel = formatDigestDateLabel(payload.digestDate);
    const needsCallMeBot =
      !result.sent &&
      (result.reason === "green_api_same_number_use_callmebot" ||
        Boolean(result.reason?.includes("QUOTE")));
    const alertTitle = needsCallMeBot && !userCtx?.hasCallMeBotKey
      ? "להודעות WhatsApp — הפעל CallMeBot"
      : `הודעה יומית (${dateLabel}) ממערכת BabaiTk`;
    const alertBody = needsCallMeBot && !userCtx?.hasCallMeBotKey
      ? `Green-API מוגבל / אותו מספר — אין צליל. פתח והשלח: ${CALLMEBOT_ACTIVATE_URL} — אחר כך הדבק APIKEY בהגדרות וואטסאפ.`
      : payload.items.length === 0
        ? "אין תזכורות להיום"
        : result.sent
          ? `${payload.items.length} תזכורות נשלחו לוואטסאפ`
          : `${payload.items.length} תזכורות — WhatsApp לא נשלח (${result.reason ?? "שגיאה"})`;

    if (userCtx?.notifyInApp !== false) {
      await ctx.runMutation(internal.reminders.createInAppNotification, {
        userId: payload.userId,
        kind: "item_reminder",
        title: alertTitle,
        body: alertBody,
        fireAt: new Date().toISOString(),
        // Unique every force-send so the OS alert always fires (no dedupe silence).
        dedupeKey: `digest-force:${payload.userId}:${payload.digestDate}:${Date.now()}`,
      });
    }

    if (userCtx && userCtx.pushTokens.length > 0) {
      await ctx.runAction(internal.reminders.sendExpoPush, {
        tokens: userCtx.pushTokens,
        title: alertTitle,
        body: alertBody,
        data: {
          kind: "daily_digest",
          digestDate: payload.digestDate,
          sound: true,
        },
      });
    }

    // Only mark slot when sending for the real "today" digest.
    if (result.sent && dayOffset === 0) {
      const hour = localHour(getZonedParts(new Date(nowIso), DIGEST_TIMEZONE));
      await ctx.runMutation(internal.reminders.markWhatsAppDigestSent, {
        userId: payload.userId,
        digestDate: payload.digestDate,
        hour,
      });
    }

    return {
      ok: result.sent,
      phone: payload.phone,
      name: payload.name,
      digestDate: payload.digestDate,
      itemCount: payload.items.length,
      provider: result.provider,
      reason: result.reason,
    };
  },
});

export const collectTodayDigestForEmail = internalQuery({
  args: {
    email: v.string(),
    nowIso: v.string(),
    dayOffset: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      name: v.union(v.string(), v.null()),
      phone: v.string(),
      captureGroupChatId: v.union(v.string(), v.null()),
      digestDate: v.string(),
      items: v.array(digestItemValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, { email, nowIso, dayOffset }) => {
    const now = new Date(nowIso);
    if (Number.isNaN(now.getTime())) return null;
    const offset = Number.isFinite(dayOffset) ? Math.trunc(dayOffset!) : 0;
    const anchor = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const nowParts = getZonedParts(anchor, DIGEST_TIMEZONE);
    const digestDate = localDateKey(nowParts);
    const needle = email.trim().toLowerCase();

    const users = await ctx.db.query("users").take(500);
    const user = users.find((row) => (row.email ?? "").toLowerCase() === needle);
    if (!user?.phone || user.phoneVerified !== true) return null;

    const items: DigestItem[] = [];

    const inbox = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "inbox"),
      )
      .take(200);
    const pending = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "pending"),
      )
      .take(200);
    const done = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "completed"),
      )
      .take(200);
    for (const task of [...inbox, ...pending, ...done]) {
      if (task.deletedAt) continue;
      const fireAt = resolveNotifyAt({
        isTask: true,
        dueDate: task.dueDate,
        metadata: task.metadata,
      });
      // For historical digests, also fall back to dueDate when notify_at is missing/sent.
      const candidate =
        fireAt ??
        (typeof task.dueDate === "string" && task.dueDate ? task.dueDate : null);
      if (!candidate || !isSameLocalDay(candidate, anchor, DIGEST_TIMEZONE)) continue;
      items.push({
        kind: "task",
        title: task.title,
        fireAt: candidate,
        tags: normalizeDigestTags(task.tags),
      });
    }

    const notebookInbox = await ctx.db
      .query("notebooks")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "inbox"),
      )
      .take(200);
    const notebookPending = await ctx.db
      .query("notebooks")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "pending"),
      )
      .take(200);
    const notebookDone = await ctx.db
      .query("notebooks")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "archived"),
      )
      .take(200);
    for (const notebook of [...notebookInbox, ...notebookPending, ...notebookDone]) {
      if (notebook.deletedAt) continue;
      const fireAt = resolveNotifyAt({
        isTask: false,
        dueDate: notebook.dueDate ?? null,
        metadata: notebook.metadata,
      });
      const candidate =
        fireAt ??
        (typeof notebook.dueDate === "string" && notebook.dueDate
          ? notebook.dueDate
          : null);
      if (!candidate || !isSameLocalDay(candidate, anchor, DIGEST_TIMEZONE)) continue;
      items.push({
        kind: "notebook",
        title: notebook.title,
        fireAt: candidate,
        tags: normalizeDigestTags(notebook.tags),
      });
    }

    const lists = await ctx.db
      .query("taskLists")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", user._id).eq("status", "active"),
      )
      .take(100);
    for (const list of lists) {
      if (list.deletedAt) continue;
      if (!list.reminderAt) continue;
      if (!isSameLocalDay(list.reminderAt, anchor, DIGEST_TIMEZONE)) continue;
      items.push({
        kind: "list",
        title: list.name,
        fireAt: list.reminderAt,
        tags: [],
      });
    }

    items.sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt));
    return {
      userId: user._id,
      name: user.name ?? null,
      phone: user.phone,
      captureGroupChatId: user.whatsappCaptureGroupChatId
        ? user.whatsappCaptureGroupChatId.trim()
        : null,
      digestDate,
      items,
    };
  },
});
