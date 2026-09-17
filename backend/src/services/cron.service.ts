import { buildAfterReminderSentPatch } from "../lib/reminderRecurrence.js";
import {
  buildWhatsAppReminderMessage,
  resolveReminderDestination,
} from "../lib/whatsapp-reminder-message.js";
import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { sendWhatsAppText } from "./whatsapp.service.js";
import { sendViaUserGreenApi } from "./whatsapp/user-gateway-send.js";
import { normalizePhone } from "./items.service.js";
import { resetUsagePeriodIfNeeded } from "./usage.service.js";

const TRASH_RETENTION_DAYS = 30;

export { TRASH_RETENTION_DAYS };

/**
 * Moves idle inbox items to archive per user's notebook archive setting.
 */
export async function archiveStaleInboxItems(): Promise<number> {
  if (!env.isSupabaseConfigured) return 0;

  const supabase = getSupabaseAdmin();

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, inbox_archive_hours");

  if (usersError) {
    throw new Error(`Inbox archive failed to load users: ${usersError.message}`);
  }

  let total = 0;

  for (const user of users ?? []) {
    const hours =
      typeof user.inbox_archive_hours === "number" && user.inbox_archive_hours > 0
        ? user.inbox_archive_hours
        : 48;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("mindtasker_items")
      .update({ status: "snoozed_archive" })
      .eq("user_id", user.id)
      .eq("status", "inbox")
      .is("deleted_at", null)
      .lt("last_interacted_at", cutoff)
      .select("id");

    if (error) {
      throw new Error(`Inbox archive failed for user ${user.id}: ${error.message}`);
    }

    total += data?.length ?? 0;
  }

  return total;
}

/**
 * Morning digest (08:00): WhatsApp summary of pending inbox + today's tasks.
 */
export async function sendDailyDigests(): Promise<number> {
  if (!env.isSupabaseConfigured) return 0;

  const supabase = getSupabaseAdmin();

  const { data: users, error } = await supabase
    .from("users")
    .select("id, phone")
    .not("phone", "is", null)
    .eq("phone_verified", true);

  if (error) {
    throw new Error(`Failed to load users for digest: ${error.message}`);
  }

  let sent = 0;

  for (const user of users ?? []) {
    if (!user.phone) continue;

    const [{ count: inboxCount }, { count: todayCount }] = await Promise.all([
      supabase
        .from("mindtasker_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "inbox")
        .is("deleted_at", null),
      supabase
        .from("mindtasker_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_actionable", true)
        .eq("status", "pending")
        .is("deleted_at", null),
    ]);

    const inbox = inboxCount ?? 0;
    const today = todayCount ?? 0;

    if (inbox === 0 && today === 0) continue;

    const message =
      `בוקר טוב! ☀️\n` +
      `מחכים לך ${inbox} פריטים ב-Inbox` +
      (today > 0 ? ` ו-${today} משימות לביצוע` : "") +
      `.\nפתח את BabaiTk לאישור וסידור.`;

    try {
      await sendWhatsAppText(normalizePhone(user.phone), message);
      sent++;
    } catch {
      // Skip users where WhatsApp send fails
    }
  }

  return sent;
}

export async function resetMonthlyUsageForAllUsers(): Promise<number> {
  if (!env.isSupabaseConfigured) return 0;

  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: users, error } = await supabase
    .from("users")
    .select("id, usage_period_start")
    .lt("usage_period_start", cutoff);

  if (error) {
    throw new Error(`Failed to load users for usage reset: ${error.message}`);
  }

  let reset = 0;
  for (const user of users ?? []) {
    await resetUsagePeriodIfNeeded(user.id);
    reset++;
  }

  return reset;
}

type ReminderUserRow = {
  phone: string | null;
  phone_verified: boolean;
  notify_whatsapp_group: boolean | null;
  whatsapp_capture_group_chat_id: string | null;
};

type GatewayRow = {
  instance_id: string;
  api_token: string;
  api_url: string;
};

async function loadReminderUser(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
): Promise<{ user: ReminderUserRow; gateway: GatewayRow | null } | null> {
  const [{ data: user }, { data: gateway }] = await Promise.all([
    supabase
      .from("users")
      .select(
        "phone, phone_verified, notify_whatsapp_group, whatsapp_capture_group_chat_id",
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("whatsapp_gateways")
      .select("instance_id, api_token, api_url")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (!user) return null;
  return {
    user: user as ReminderUserRow,
    gateway: (gateway as GatewayRow | null) ?? null,
  };
}

async function deliverWhatsAppReminder(
  context: { user: ReminderUserRow; gateway: GatewayRow | null },
  message: string,
): Promise<boolean> {
  const destination = resolveReminderDestination(context.user);
  if (destination.kind === "none") return false;
  if (destination.kind === "group") {
    if (!context.gateway) return false;
    await sendViaUserGreenApi(context.gateway, destination.chatId, message);
    return true;
  }
  if (context.gateway) {
    await sendViaUserGreenApi(context.gateway, destination.phone, message);
    return true;
  }
  await sendWhatsAppText(normalizePhone(destination.phone), message);
  return true;
}

/**
 * Sends WhatsApp reminders for tasks (notify_at), notes (manual due_date),
 * and list reminders. Group delivery uses the user's connected instance.
 */
export async function sendTaskReminders(): Promise<number> {
  if (!env.isSupabaseConfigured) return 0;

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  let sent = 0;

  const { data: items, error } = await supabase
    .from("mindtasker_items")
    .select("id, user_id, title, metadata, due_date, is_actionable")
    .in("status", ["inbox", "pending"])
    .is("deleted_at", null);

  if (error) {
    throw new Error(`Failed to load items for reminders: ${error.message}`);
  }

  const userCache = new Map<string, { user: ReminderUserRow; gateway: GatewayRow | null } | null>();

  async function contextFor(userId: string) {
    if (!userCache.has(userId)) {
      userCache.set(userId, await loadReminderUser(supabase, userId));
    }
    return userCache.get(userId) ?? null;
  }

  for (const item of items ?? []) {
    const metadata = (item.metadata ?? {}) as Record<string, unknown>;
    if (metadata.reminder_sent === true) continue;
    if (metadata.reminder_disabled === true) continue;

    const analysis = metadata.analysis as Record<string, unknown> | undefined;
    let notifyAt: string | null = null;

    if (item.is_actionable) {
      notifyAt =
        (typeof analysis?.notify_at === "string" && analysis.notify_at) ||
        item.due_date ||
        null;
    } else if (metadata.reminder_manual === true && item.due_date) {
      notifyAt = item.due_date;
    }

    if (!notifyAt || notifyAt > now) continue;

    const context = await contextFor(item.user_id);
    if (!context) continue;

    const message = buildWhatsAppReminderMessage(
      item.title,
      item.due_date,
      item.is_actionable ? "task" : "note",
    );

    try {
      const delivered = await deliverWhatsAppReminder(context, message);
      if (!delivered) continue;
      const after = buildAfterReminderSentPatch(
        { due_date: item.due_date, metadata },
        { firedAt: notifyAt },
      );
      await supabase
        .from("mindtasker_items")
        .update({
          ...(after.due_date !== undefined ? { due_date: after.due_date } : {}),
          metadata: after.metadata,
        })
        .eq("id", item.id);
      sent++;
    } catch {
      // Skip failed sends; retry next cron tick
    }
  }

  const { data: lists, error: listsError } = await supabase
    .from("task_lists")
    .select("id, user_id, name, reminder_at")
    .eq("status", "active")
    .is("deleted_at", null)
    .not("reminder_at", "is", null)
    .lte("reminder_at", now);

  if (listsError) {
    throw new Error(`Failed to load lists for reminders: ${listsError.message}`);
  }

  for (const list of lists ?? []) {
    const context = await contextFor(list.user_id);
    if (!context) continue;
    const message = buildWhatsAppReminderMessage(list.name, list.reminder_at, "list");
    try {
      const delivered = await deliverWhatsAppReminder(context, message);
      if (!delivered) continue;
      await supabase
        .from("task_lists")
        .update({ reminder_at: null, updated_at: new Date().toISOString() })
        .eq("id", list.id);
      sent++;
    } catch {
      // retry next tick
    }
  }

  return sent;
}

/**
 * Permanently removes items that were soft-deleted more than 30 days ago.
 */
export async function purgeExpiredDeletedItems(): Promise<number> {
  if (!env.isSupabaseConfigured) return 0;

  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("mindtasker_items")
    .delete()
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff)
    .select("id");

  if (error) {
    throw new Error(`Trash purge failed: ${error.message}`);
  }

  return data?.length ?? 0;
}
