import {
  buildNotebookReminderMessage,
  isNotebookReminderDue,
  normalizeNotebookReminderPrefs,
  notebookReminderDateKey,
  NOTEBOOK_REMINDER_MAX_TITLES,
} from "./notebook-reminder.ts";
import { resolveReminderDestination } from "./whatsapp-reminders.ts";

type Admin = {
  from: (table: string) => any;
};

export type NotebookReminderUserRow = {
  id: string;
  phone?: string | null;
  phone_verified?: boolean | null;
  notify_whatsapp_group?: boolean | null;
  whatsapp_capture_group_chat_id?: string | null;
  whatsapp_shabbat_mode_enabled?: boolean | null;
  notebook_reminder_enabled?: boolean | null;
  notebook_reminder_hour?: number | null;
  notebook_reminder_minute?: number | null;
  notebook_reminder_last_sent_on?: string | null;
};

export type NotebookReminderOptions = {
  /** Env kill switch (WHATSAPP_NOTEBOOK_REMINDER, default on). */
  enabled: boolean;
  /** True inside Shabbat / holiday quiet hours (and WHATSAPP_SHABBAT_MODE on). */
  shabbatQuiet: boolean;
  /** Compute and report, never claim or send. */
  dryRun?: boolean;
  /** Restrict to one user (dry runs / tests). */
  userId?: string;
};

export type NotebookReminderPreview = { userId: string; count: number; message: string | null };

const USER_COLUMNS =
  "id, phone, phone_verified, notify_whatsapp_group, whatsapp_capture_group_chat_id, whatsapp_shabbat_mode_enabled, notebook_reminder_enabled, notebook_reminder_hour, notebook_reminder_minute, notebook_reminder_last_sent_on";

function missingColumn(error: { message?: string; code?: string } | null): boolean {
  const message = error?.message ?? "";
  return error?.code === "42703" || error?.code === "PGRST204" || /does not exist|Could not find the column/i.test(message);
}

/** Notebook = the same rows the web/mobile notebook board shows. */
export async function loadNotebookSummary(
  admin: Admin,
  userId: string,
): Promise<{ count: number; titles: string[] }> {
  const { data, count, error } = await admin
    .from("mindtasker_items")
    .select("title", { count: "exact" })
    .eq("user_id", userId)
    .eq("status", "inbox")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(NOTEBOOK_REMINDER_MAX_TITLES);
  if (error) throw new Error(error.message);
  const titles = (data ?? []).map((row: { title?: string | null }) => String(row.title ?? ""));
  return { count: typeof count === "number" ? count : titles.length, titles };
}

/**
 * One WhatsApp message per user per local day with the number of notebook items waiting.
 * Idempotent: the day is claimed with a conditional update before sending, so concurrent or
 * repeated cron ticks cannot double-send; a failed send releases the claim.
 */
export async function dispatchNotebookReminders(
  admin: Admin,
  deliver: (userId: string, message: string) => Promise<boolean>,
  now: Date,
  options: NotebookReminderOptions,
): Promise<{ notebookReminders: number; previews: NotebookReminderPreview[] }> {
  const previews: NotebookReminderPreview[] = [];
  if (!options.enabled) return { notebookReminders: 0, previews };

  let query = admin.from("users").select(USER_COLUMNS).eq("notebook_reminder_enabled", true);
  if (options.userId) query = query.eq("id", options.userId);
  const { data, error } = await query;
  if (error) {
    if (missingColumn(error)) return { notebookReminders: 0, previews };
    throw new Error(error.message);
  }

  const dateKey = notebookReminderDateKey(now);
  let sent = 0;
  for (const row of (data ?? []) as NotebookReminderUserRow[]) {
    try {
      if (options.shabbatQuiet && row.whatsapp_shabbat_mode_enabled !== false) continue;
      const prefs = normalizeNotebookReminderPrefs(row);
      if (!isNotebookReminderDue(now, prefs, row.notebook_reminder_last_sent_on)) continue;
      if (resolveReminderDestination(row).kind === "none") continue;

      const summary = await loadNotebookSummary(admin, row.id);
      const message = buildNotebookReminderMessage(summary.count, summary.titles);
      if (options.dryRun) {
        previews.push({ userId: row.id, count: summary.count, message });
        continue;
      }
      if (!message) continue;

      const previous = row.notebook_reminder_last_sent_on ?? null;
      let claim = admin
        .from("users")
        .update({ notebook_reminder_last_sent_on: dateKey })
        .eq("id", row.id);
      claim = previous
        ? claim.eq("notebook_reminder_last_sent_on", previous)
        : claim.is("notebook_reminder_last_sent_on", null);
      const { data: claimed, error: claimError } = await claim.select("id");
      if (claimError) throw new Error(claimError.message);
      if (!Array.isArray(claimed) || claimed.length === 0) continue;

      let delivered = false;
      try {
        delivered = await deliver(row.id, message);
      } finally {
        if (!delivered) {
          await admin
            .from("users")
            .update({ notebook_reminder_last_sent_on: previous })
            .eq("id", row.id)
            .eq("notebook_reminder_last_sent_on", dateKey);
        }
      }
      if (delivered) sent += 1;
    } catch (err) {
      console.error("notebook reminder failed", err);
    }
  }
  return { notebookReminders: sent, previews };
}
