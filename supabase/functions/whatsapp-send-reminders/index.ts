import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

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
} from "../_shared/whatsapp-digest.ts";
import {
  buildWhatsAppReminderMessage,
  patchAfterReminderSent,
  resolveItemNotifyAt,
  resolveReminderDestination,
  sendGreenApiChatMessage,
  stampWhatsAppReminderFireAt,
  whatsappReminderFireStamp,
} from "../_shared/whatsapp-reminders.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("REMINDER_CRON_SECRET")?.trim() ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    },
  });
}

function bearerToken(req: Request): string {
  const auth = req.headers.get("Authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
}

function isCronAuth(req: Request): boolean {
  const token = bearerToken(req);
  const queryToken = new URL(req.url).searchParams.get("token") ?? "";
  if (SERVICE_ROLE && token === SERVICE_ROLE) return true;
  if (CRON_SECRET && (token === CRON_SECRET || queryToken === CRON_SECRET)) return true;
  return false;
}

async function userIdFromJwt(
  req: Request,
  admin: ReturnType<typeof createClient>,
): Promise<string | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "missing_supabase_env" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const cron = isCronAuth(req);
  const scopedUserId = cron ? null : await userIdFromJwt(req, admin);
  if (!cron && !scopedUserId) {
    return json({ error: "not_authenticated" }, 401);
  }

  let body: { test?: boolean; itemId?: string; fireAt?: string } = {};
  if (req.method === "POST") {
    try {
      const parsed: unknown = await req.json();
      if (parsed && typeof parsed === "object") {
        body = parsed as { test?: boolean; itemId?: string; fireAt?: string };
      }
    } catch {
      body = {};
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();
  let sent = 0;
  let digests = 0;
  const userCache = new Map<string, { user: ReminderUserRow; gateway: GatewayRow | null } | null>();

  async function contextFor(userId: string) {
    if (userCache.has(userId)) return userCache.get(userId) ?? null;
    const [{ data: user }, { data: gateway }] = await Promise.all([
      admin
        .from("users")
        .select("phone, phone_verified, notify_whatsapp_group, whatsapp_capture_group_chat_id")
        .eq("id", userId)
        .maybeSingle(),
      admin
        .from("whatsapp_gateways")
        .select("instance_id, api_token, api_url")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    const packed = user
      ? {
          user: user as ReminderUserRow,
          gateway: (gateway as GatewayRow | null) ?? null,
        }
      : null;
    userCache.set(userId, packed);
    return packed;
  }

  async function deliver(
    context: { user: ReminderUserRow; gateway: GatewayRow | null },
    message: string,
  ): Promise<boolean> {
    const destination = resolveReminderDestination(context.user);
    if (destination.kind === "none") return false;
    if (destination.kind === "group") {
      if (!context.gateway) return false;
      await sendGreenApiChatMessage(context.gateway, destination.chatId, message);
      return true;
    }
    if (!context.gateway) return false;
    await sendGreenApiChatMessage(context.gateway, destination.phone, message);
    return true;
  }

  if (body.test === true && scopedUserId) {
    const context = await contextFor(scopedUserId);
    if (!context) return json({ error: "user_not_found" }, 404);
    const destination = resolveReminderDestination(context.user);
    if (destination.kind === "none") {
      return json({ error: "no_whatsapp_destination", sent: 0 }, 409);
    }
    try {
      const delivered = await deliver(
        context,
        "בדיקת תזכורת מ-BabiTk\n\nאם ההודעה הזו הגיעה — התזכורות לקבוצה/לוואטסאפ עובדות.",
      );
      return json({ ok: delivered, sent: delivered ? 1 : 0, test: true, destination: destination.kind });
    } catch (error) {
      console.error("test reminder send failed", error);
      return json(
        { error: error instanceof Error ? error.message : "send_failed", sent: 0 },
        502,
      );
    }
  }

  if (body.itemId && scopedUserId) {
    const { data: item, error: itemError } = await admin
      .from("mindtasker_items")
      .select("id, user_id, title, metadata, due_date, is_actionable")
      .eq("id", body.itemId)
      .eq("user_id", scopedUserId)
      .maybeSingle();
    if (itemError) return json({ error: itemError.message }, 500);
    if (!item) return json({ error: "item_not_found", sent: 0 }, 404);
    const metadata = (item.metadata ?? {}) as Record<string, unknown>;
    const fireAt =
      (typeof body.fireAt === "string" && body.fireAt.trim()) ||
      resolveItemNotifyAt(item) ||
      item.due_date;
    if (!fireAt) return json({ error: "no_notify_at", sent: 0 }, 409);
    if (whatsappReminderFireStamp(metadata) === fireAt) {
      return json({ ok: true, sent: 0, already: true });
    }
    const context = await contextFor(scopedUserId);
    if (!context) return json({ error: "user_not_found", sent: 0 }, 404);
    try {
      const delivered = await deliver(
        context,
        buildWhatsAppReminderMessage(
          item.title,
          item.due_date ?? fireAt,
          item.is_actionable ? "task" : "note",
        ),
      );
      if (!delivered) {
        return json({ error: "no_whatsapp_destination", sent: 0 }, 409);
      }
      const { data: fresh } = await admin
        .from("mindtasker_items")
        .select("metadata")
        .eq("id", item.id)
        .maybeSingle();
      const latest =
        fresh?.metadata && typeof fresh.metadata === "object"
          ? (fresh.metadata as Record<string, unknown>)
          : metadata;
      await admin
        .from("mindtasker_items")
        .update({ metadata: stampWhatsAppReminderFireAt(latest, fireAt) })
        .eq("id", item.id);
      return json({ ok: true, sent: 1 });
    } catch (error) {
      console.error("reminder item send failed", error);
      return json(
        { error: error instanceof Error ? error.message : "send_failed", sent: 0 },
        502,
      );
    }
  }

  let itemsQuery = admin
    .from("mindtasker_items")
    .select("id, user_id, title, metadata, due_date, is_actionable")
    .in("status", ["inbox", "pending"])
    .is("deleted_at", null);
  if (scopedUserId) itemsQuery = itemsQuery.eq("user_id", scopedUserId);

  const { data: items, error: itemsError } = await itemsQuery;
  if (itemsError) {
    return json({ error: itemsError.message }, 500);
  }

  for (const item of items ?? []) {
    const metadata = (item.metadata ?? {}) as Record<string, unknown>;
    if (metadata.reminder_sent === true) continue;
    const notifyAt = resolveItemNotifyAt(item);
    if (!notifyAt || notifyAt > nowIso) continue;
    if (whatsappReminderFireStamp(metadata) === notifyAt) continue;
    const context = await contextFor(item.user_id);
    if (!context) continue;
    try {
      const delivered = await deliver(
        context,
        buildWhatsAppReminderMessage(
          item.title,
          item.due_date,
          item.is_actionable ? "task" : "note",
        ),
      );
      if (!delivered) continue;
      const after = patchAfterReminderSent(
        { due_date: item.due_date, metadata },
        notifyAt,
      );
      await admin
        .from("mindtasker_items")
        .update({
          ...(after.due_date !== undefined ? { due_date: after.due_date } : {}),
          metadata: stampWhatsAppReminderFireAt(after.metadata, notifyAt),
        })
        .eq("id", item.id);
      sent += 1;
    } catch (error) {
      console.error("reminder item send failed", error);
    }
  }

  let listsQuery = admin
    .from("task_lists")
    .select("id, user_id, name, reminder_at")
    .eq("status", "active")
    .is("deleted_at", null)
    .not("reminder_at", "is", null)
    .lte("reminder_at", nowIso);
  if (scopedUserId) listsQuery = listsQuery.eq("user_id", scopedUserId);
  const { data: lists, error: listsError } = await listsQuery;
  if (listsError) {
    return json({ error: listsError.message, sent }, 500);
  }

  for (const list of lists ?? []) {
    const context = await contextFor(list.user_id);
    if (!context) continue;
    try {
      const delivered = await deliver(
        context,
        buildWhatsAppReminderMessage(list.name, list.reminder_at, "list"),
      );
      if (!delivered) continue;
      await admin
        .from("task_lists")
        .update({ reminder_at: null, updated_at: new Date().toISOString() })
        .eq("id", list.id);
      sent += 1;
    } catch (error) {
      console.error("reminder list send failed", error);
    }
  }

  if (!cron) {
    return json({ ok: true, sent, digests: 0 });
  }

  const hour = localHour(now);
  const digestDate = localDateKey(now);
  const slotKey = digestSlotKey(digestDate, hour);
  const weekdayNum = localWeekday(now);
  const { data: digestUsers, error: digestUsersError } = await admin
    .from("users")
    .select(
      "id, phone, phone_verified, notify_whatsapp_group, whatsapp_capture_group_chat_id, whatsapp_digest_hours, whatsapp_digest_days, whatsapp_digest_slots",
    );
  if (digestUsersError) {
    return json({ error: digestUsersError.message, sent, digests }, 500);
  }

  for (const row of digestUsers ?? []) {
    const hours = resolveDigestHours(row.whatsapp_digest_hours);
    if (!hours.includes(hour)) continue;
    if (!isDigestDayAllowed(weekdayNum, resolveDigestDays(row.whatsapp_digest_days))) continue;
    const already = Array.isArray(row.whatsapp_digest_slots) ? row.whatsapp_digest_slots : [];
    if (already.includes(slotKey)) continue;
    const context = await contextFor(row.id);
    if (!context) continue;
    const [{ data: userItems }, { data: userLists }] = await Promise.all([
      admin
        .from("mindtasker_items")
        .select("title, metadata, due_date, is_actionable")
        .eq("user_id", row.id)
        .in("status", ["inbox", "pending"])
        .is("deleted_at", null),
      admin
        .from("task_lists")
        .select("name, reminder_at")
        .eq("user_id", row.id)
        .eq("status", "active")
        .is("deleted_at", null)
        .not("reminder_at", "is", null),
    ]);
    const digestItems: DigestItem[] = [];
    for (const item of userItems ?? []) {
      const fireAt = resolveItemNotifyAt(item);
      if (!fireAt || !isSameLocalDay(fireAt, now)) continue;
      digestItems.push({
        kind: item.is_actionable ? "task" : "note",
        title: item.title,
        fireAt,
      });
    }
    for (const list of userLists ?? []) {
      if (!list.reminder_at || !isSameLocalDay(list.reminder_at, now)) continue;
      digestItems.push({ kind: "list", title: list.name, fireAt: list.reminder_at });
    }
    if (digestItems.length === 0) {
      continue;
    }
    try {
      const delivered = await deliver(context, buildWhatsAppDigestMessage(digestItems, digestDate));
      if (!delivered) continue;
      await admin
        .from("users")
        .update({ whatsapp_digest_slots: appendDigestSlot(already, slotKey, digestDate) })
        .eq("id", row.id);
      digests += 1;
    } catch (error) {
      console.error("digest send failed", error);
    }
  }

  return json({ ok: true, sent, digests });
});
