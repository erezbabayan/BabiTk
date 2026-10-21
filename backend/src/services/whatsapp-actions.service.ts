import { addZonedDays, addZonedMinutes, getZonedParts } from "../utils/timezone.js";
import {
  parseWhatsAppCommand,
  resolveCommandItemId,
} from "../lib/whatsapp-commands.js";
import {
  builtInMenuQuestions,
  buildTaskBriefing,
  buildWhatsAppMenuText,
  itemMatchesBriefingDay,
  itemMatchesQueryTag,
  parseMenuSelection,
  parseWhatsAppQuery,
  type WhatsAppQuery,
} from "../lib/whatsapp-query.js";
import { classifyWhatsAppInbound } from "../lib/whatsapp-inbound-route.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { env } from "../config/env.js";
import {
  completeItem,
  getItemById,
  snoozeItem,
} from "./items.service.js";
import { getUserTagNames } from "./user-tags.service.js";
import { sendWhatsAppText } from "./whatsapp/send.js";
import { sendWhatsAppOutbound } from "./whatsapp/outbound.js";
import type { DbMindtaskerItem } from "../types/database.js";
import { featureFlags } from "../lib/feature-flags.js";
import {
  buildSearchReply,
  nextWeekdayIso,
  parseMoveCommand,
  parseNoteSearch,
  rankByOverlap,
  weekdayLabel,
} from "../lib/proactive-whatsapp.js";
import { rememberWhatsAppUndo, undoLastWhatsAppAction } from "./whatsapp-undo.service.js";
import { searchItems } from "./search.service.js";
import { isGratitudeOnly } from "../lib/forwarded-task.js";
import { handleTaskBreakdown, rememberMorningHabit } from "./whatsapp-breakdown.service.js";

const TIMEZONE = "Asia/Jerusalem";

export type LinkedWhatsAppUser = {
  id: string;
  phone: string | null;
  whatsapp_last_item_ids?: string[] | null;
  whatsapp_capture_group_chat_id?: string | null;
  notify_whatsapp?: boolean | null;
  onboarding_completed_at?: string | null;
};

export function replyDestination(message: { from: string; chatId?: string }): string {
  if (message.chatId?.endsWith("@g.us")) return message.chatId;
  return message.from;
}

export async function listOpenTasks(userId: string): Promise<DbMindtaskerItem[]> {
  if (!env.isSupabaseConfigured) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select("id, user_id, title, content, is_actionable, status, due_date, tags, metadata")
    .eq("user_id", userId)
    .eq("is_actionable", true)
    .in("status", ["inbox", "pending"])
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(`Failed to list open tasks: ${error.message}`);
  }
  return (data ?? []) as DbMindtaskerItem[];
}

export function filterTasksForQuery(
  items: DbMindtaskerItem[],
  query: WhatsAppQuery,
  now = new Date(),
): DbMindtaskerItem[] {
  return items.filter(
    (item) =>
      itemMatchesBriefingDay(item, query.day, now, TIMEZONE) &&
      itemMatchesQueryTag(item, query.tag),
  );
}

export async function rememberLastWhatsAppItems(
  userId: string,
  itemIds: string[],
): Promise<void> {
  if (!env.isSupabaseConfigured) return;
  const supabase = getSupabaseAdmin();
  await supabase
    .from("users")
    .update({ whatsapp_last_item_ids: itemIds.slice(0, 12) })
    .eq("id", userId);
}

export async function loadLastWhatsAppItemIds(userId: string): Promise<string[]> {
  if (!env.isSupabaseConfigured) return [];
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("users")
    .select("whatsapp_last_item_ids")
    .eq("id", userId)
    .maybeSingle();
  const ids = data?.whatsapp_last_item_ids;
  return Array.isArray(ids) ? ids.map(String) : [];
}

export async function handleWhatsAppTextIntent(options: {
  user: LinkedWhatsAppUser;
  text: string;
  replyTo: string;
  forwarded?: boolean;
}): Promise<boolean> {
  const raw = options.text.trim();
  if (!raw) return false;

  if (options.forwarded && isGratitudeOnly(raw)) {
    await sendWhatsAppText(options.replyTo, "לא שמרתי את ההודעה שהועברה. אין בה משימה.");
    return true;
  }

  const breakdown = await handleTaskBreakdown(options.user.id, raw);
  if (breakdown) {
    await sendWhatsAppText(options.replyTo, breakdown);
    return true;
  }

  if (featureFlags.nlCommands) {
    const move = parseMoveCommand(raw);
    if (move) {
      const tasks = await listOpenTasks(options.user.id);
      const item = move.title
        ? rankByOverlap(move.title, tasks.map((task) => ({
            id: task.id,
            title: task.title,
            content: task.content,
          })))[0]
        : null;
      const lastIds = await loadLastWhatsAppItemIds(options.user.id);
      const itemId = item?.id ?? lastIds[0] ?? null;
      if (!itemId) {
        await sendWhatsAppText(options.replyTo, "לא מצאתי משימה להזזה. כתבו «תפריט».");
        return true;
      }
      const current = await getItemById(itemId, options.user.id);
      const due = nextWeekdayIso(new Date(), move.weekday, 9, 0, TIMEZONE);
      await rememberWhatsAppUndo(options.user.id, "snooze", [
        {
          id: current.id,
          title: current.title,
          status: current.status,
          due_date: current.due_date,
          deleted_at: null,
        },
      ]);
      const updated = await snoozeItem(options.user.id, itemId, due);
      rememberMorningHabit(options.user.id, current.title, current.content, due);
      await sendWhatsAppText(
        options.replyTo,
        `הועבר ליום ${weekdayLabel(move.weekday)} ב-09:00: ${updated.title}`,
      );
      return true;
    }
  }

  if (featureFlags.semanticSearch) {
    const query = parseNoteSearch(raw);
    if (query) {
      let hits: Array<{ id: string; title: string }> = [];
      try {
        const semantic = await searchItems(options.user.id, query, { matchCount: 5 });
        hits = semantic.map((row) => ({ id: row.id, title: row.title }));
      } catch {
        hits = [];
      }
      if (hits.length === 0) {
        const tasks = await listOpenTasks(options.user.id);
        hits = rankByOverlap(
          query,
          tasks.map((task) => ({ id: task.id, title: task.title, content: task.content })),
        );
      }
      await sendWhatsAppText(options.replyTo, buildSearchReply(query, hits));
      return true;
    }
  }

  const route = classifyWhatsAppInbound(raw);
  if (route.lane === "capture") return false;

  if (route.lane === "command") {
    const command = parseWhatsAppCommand(raw);
    if (!command) return false;
    if (command.type === "undo") {
      const message = featureFlags.undo
        ? await undoLastWhatsAppAction(options.user.id)
        : "ביטול כבוי. הפעילו WHATSAPP_UNDO.";
      await sendWhatsAppText(options.replyTo, message);
      return true;
    }
    const lastIds = await loadLastWhatsAppItemIds(options.user.id);
    const itemId = resolveCommandItemId(command, lastIds);
    if (!itemId) {
      await sendWhatsAppText(
        options.replyTo,
        "לא מצאתי פריט אחרון. כתבו «תפריט» או בחרו מספר אחרי הקליטה.",
      );
      return true;
    }

    const now = new Date();
    const current = await getItemById(itemId, options.user.id);
    const snapshot = {
      id: current.id,
      title: current.title,
      status: current.status,
      due_date: current.due_date,
      deleted_at: null,
    };
    if (command.type === "complete") {
      await rememberWhatsAppUndo(options.user.id, "complete", [snapshot]);
      const item = await completeItem(options.user.id, itemId);
      await sendWhatsAppOutbound({
        to: options.replyTo,
        body: `סומן כבוצע: ${item.title}\nאפשר לכתוב «בטל».`,
        quickReplies: [{ id: "undo", title: "בטל" }],
      });
      return true;
    }

    if (command.type === "snooze") {
      await rememberWhatsAppUndo(options.user.id, "snooze", [snapshot]);
      const due = addZonedMinutes(TIMEZONE, now, command.hours * 60);
      const item = await snoozeItem(options.user.id, itemId, due);
      await sendWhatsAppText(options.replyTo, `נדחה ל-${formatClock(due)}: ${item.title}`);
      return true;
    }

    await rememberWhatsAppUndo(options.user.id, "snooze", [snapshot]);
    const due = addZonedDays(TIMEZONE, now, 1, command.hour, 0);
    const item = await snoozeItem(options.user.id, itemId, due);
    await sendWhatsAppText(
      options.replyTo,
      `עודכן ל-מחר ${String(command.hour).padStart(2, "0")}:00: ${item.title}`,
    );
    return true;
  }

  const allowedTags = await getUserTagNames(options.user.id);
  const menu = builtInMenuQuestions(allowedTags);

  if (route.lane === "help" || route.lane === "menu") {
    await sendWhatsAppText(options.replyTo, buildWhatsAppMenuText(menu));
    await markWhatsAppOnboardingComplete(options.user.id);
    return true;
  }

  const query =
    route.lane === "menu_pick"
      ? parseMenuSelection(raw, menu)
      : parseWhatsAppQuery(route.question, allowedTags);
  if (query) {
    const tasks = filterTasksForQuery(await listOpenTasks(options.user.id), query);
    await rememberLastWhatsAppItems(
      options.user.id,
      tasks.map((item) => item.id),
    );
    await sendWhatsAppText(options.replyTo, buildTaskBriefing(tasks, query, TIMEZONE));
    return true;
  }

  return false;
}

function formatClock(iso: string): string {
  const parts = getZonedParts(new Date(iso), TIMEZONE);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export async function markWhatsAppOnboardingComplete(userId: string): Promise<void> {
  if (!env.isSupabaseConfigured) return;
  const supabase = getSupabaseAdmin();
  await supabase
    .from("users")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", userId)
    .is("onboarding_completed_at", null);
}

export async function maybeSendWhatsAppMenuOnboarding(options: {
  user: LinkedWhatsAppUser;
  replyTo: string;
  isGroup: boolean;
}): Promise<void> {
  if (!options.isGroup || !env.isSupabaseConfigured) return;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("users")
    .select("onboarding_completed_at")
    .eq("id", options.user.id)
    .maybeSingle();
  if (data?.onboarding_completed_at) return;

  const allowedTags = await getUserTagNames(options.user.id);
  const menu = builtInMenuQuestions(allowedTags);
  await sendWhatsAppText(
    options.replyTo,
    `בקבוצה הזו אפשר לשאול שאלות מובנות — בחרו מספר או כתבו «תפריט» שוב בכל עת.\n\n${buildWhatsAppMenuText(menu)}`,
  );
  await markWhatsAppOnboardingComplete(options.user.id);
}

export { getItemById };
