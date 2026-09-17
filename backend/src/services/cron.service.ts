import { buildAfterReminderSentPatch } from "../lib/reminderRecurrence.js";
import {
  appendDigestSlot,
  buildWhatsAppDigestMessage,
  digestSlotKey,
  isDigestDayAllowed,
  isSameLocalDay,
  localDateKey,
  localHour,
  localWeekday,
  resolveDigestDays,
  resolveDigestHours,
  type DigestItem,
} from "../lib/whatsapp-digest.js";
import {
  buildWhatsAppReminderMessage,
  resolveItemNotifyAt,
  resolveReminderDestination,
  stampWhatsAppReminderFireAt,
  whatsappReminderFireStamp,
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
 * WhatsApp digest of today's reminders at the hours the user picked in settings.
 * Each item still also sends at its own notify_at via sendTaskReminders.
 */
export async function sendDailyDigests(): Promise<number> {
  if (!env.isSupabaseConfigured) return 0;

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const hour = localHour(now, env.cronTimezone);
  const digestDate = localDateKey(now, env.cronTimezone);
  const slotKey = digestSlotKey(digestDate, hour);
  const weekdayNum = localWeekday(now, env.cronTimezone);

  const { data: users, error } = await supabase
    .from("users")
    .select(
      "id, phone, phone_verified, notify_whatsapp_group, whatsapp_capture_group_chat_id, whatsapp_digest_hours, whatsapp_digest_days, whatsapp_digest_slots",
    );

  if (error) {
    throw new Error(`Failed to load users for digest: ${error.message}`);
  }

  let sent = 0;

  for (const row of users ?? []) {
    const hours = resolveDigestHours(row.whatsapp_digest_hours);
    if (!hours.includes(hour)) continue;
    if (!isDigestDayAllowed(weekdayNum, resolveDigestDays(row.whatsapp_digest_days))) {
      continue;
    }
    const already = Array.isArray(row.whatsapp_digest_slots)
      ? row.whatsapp_digest_slots
      : [];
    if (already.includes(slotKey)) continue;

    const destination = resolveReminderDestination(row);
    if (destination.kind === "none") continue;

    const { data: gateway } = await supabase
      .from("whatsapp_gateways")
      .select("instance_id, api_token, api_url")
      .eq("user_id", row.id)
      .maybeSingle();

    const [{ data: items }, { data: lists }] = await Promise.all([
      supabase
        .from("mindtasker_items")
        .select("title, metadata, due_date, is_actionable")
        .eq("user_id", row.id)
        .in("status", ["inbox", "pending"])
        .is("deleted_at", null),
      supabase
        .from("task_lists")
        .select("name, reminder_at")
        .eq("user_id", row.id)
        .eq("status", "active")
        .is("deleted_at", null)
        .not("reminder_at", "is", null),
    ]);

    const digestItems: DigestItem[] = [];
    for (const item of items ?? []) {
      const fireAt = resolveItemNotifyAt(item);
      if (!fireAt || !isSameLocalDay(fireAt, now, env.cronTimezone)) continue;
      digestItems.push({
        kind: item.is_actionable ? "task" : "note",
        title: item.title,
        fireAt,
      });
    }
    for (const list of lists ?? []) {
      if (!list.reminder_at || !isSameLocalDay(list.reminder_at, now, env.cronTimezone)) {
        continue;
      }
      digestItems.push({
        kind: "list",
        title: list.name,
        fireAt: list.reminder_at,
      });
    }

    if (digestItems.length === 0) {
      continue;
    }

    const message = buildWhatsAppDigestMessage(digestItems, digestDate);
    try {
      const delivered = await deliverWhatsAppReminder(
        {
          user: row as ReminderUserRow,
          gateway: (gateway as GatewayRow | null) ?? null,
        },
        message,
      );
      if (!delivered) continue;
      await supabase
        .from("users")
        .update({ whatsapp_digest_slots: appendDigestSlot(already, slotKey, digestDate) })
        .eq("id", row.id);
      sent++;
    } catch {
      // Retry next 15-minute tick within the same hour
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
    const notifyAt = resolveItemNotifyAt(item);
    if (!notifyAt || notifyAt > now) continue;
    if (whatsappReminderFireStamp(metadata) === notifyAt) continue;

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
          metadata: stampWhatsAppReminderFireAt(after.metadata, notifyAt),
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
