import { getSupabaseAdmin } from "../lib/supabase.js";
import { sendWhatsAppText } from "./whatsapp.service.js";
import { normalizePhone } from "./items.service.js";
import { resetUsagePeriodIfNeeded } from "./usage.service.js";

const ARCHIVE_HOURS = 48;
const TRASH_RETENTION_DAYS = 30;

export { TRASH_RETENTION_DAYS };

/**
 * Moves inbox items idle for 48+ hours to temporary archive (status: snoozed_archive).
 */
export async function archiveStaleInboxItems(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - ARCHIVE_HOURS * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("mindtasker_items")
    .update({ status: "snoozed_archive" })
    .eq("status", "inbox")
    .is("deleted_at", null)
    .lt("last_interacted_at", cutoff)
    .select("id");

  if (error) {
    throw new Error(`Inbox archive failed: ${error.message}`);
  }

  return data?.length ?? 0;
}

/**
 * Morning digest (08:00): WhatsApp summary of pending inbox + today's tasks.
 */
export async function sendDailyDigests(): Promise<number> {
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
      `.\nפתח את MindTasker לאישור וסידור.`;

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

/**
 * Sends WhatsApp reminders for tasks whose notify_at has passed.
 */
export async function sendTaskReminders(): Promise<number> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: items, error } = await supabase
    .from("mindtasker_items")
    .select("id, user_id, title, metadata, due_date")
    .eq("is_actionable", true)
    .in("status", ["inbox", "pending"])
    .is("deleted_at", null);

  if (error) {
    throw new Error(`Failed to load items for reminders: ${error.message}`);
  }

  let sent = 0;

  for (const item of items ?? []) {
    const metadata = (item.metadata ?? {}) as Record<string, unknown>;
    if (metadata.reminder_sent === true) continue;

    const analysis = metadata.analysis as Record<string, unknown> | undefined;
    const notifyAt = typeof analysis?.notify_at === "string" ? analysis.notify_at : null;
    if (!notifyAt || notifyAt > now) continue;

    const { data: user } = await supabase
      .from("users")
      .select("phone, phone_verified")
      .eq("id", item.user_id)
      .maybeSingle();

    if (!user?.phone || !user.phone_verified) continue;

    const dueLabel = item.due_date
      ? new Date(item.due_date).toLocaleString("he-IL", {
          day: "numeric",
          month: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

    const message =
      `⏰ תזכורת: ${item.title}` +
      (dueLabel ? `\nמועד יעד: ${dueLabel}` : "") +
      `\nפתח את MindTasker לפרטים.`;

    try {
      await sendWhatsAppText(normalizePhone(user.phone), message);
      await supabase
        .from("mindtasker_items")
        .update({
          metadata: { ...metadata, reminder_sent: true },
        })
        .eq("id", item.id);
      sent++;
    } catch {
      // Skip failed sends; retry next cron tick
    }
  }

  return sent;
}

/**
 * Permanently removes items that were soft-deleted more than 30 days ago.
 */
export async function purgeExpiredDeletedItems(): Promise<number> {
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
