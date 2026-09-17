import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  buildWhatsAppReminderMessage,
  resolveReminderDestination,
  sendGreenApiChatMessage,
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

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const queryToken = new URL(req.url).searchParams.get("token") ?? "";
  if (SERVICE_ROLE && token === SERVICE_ROLE) return true;
  if (CRON_SECRET && (token === CRON_SECRET || queryToken === CRON_SECRET)) return true;
  return false;
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
  if (!isAuthorized(req)) {
    return json({ error: "not_authenticated" }, 401);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "missing_supabase_env" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();
  let sent = 0;
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

  const { data: items, error: itemsError } = await admin
    .from("mindtasker_items")
    .select("id, user_id, title, metadata, due_date, is_actionable")
    .in("status", ["inbox", "pending"])
    .is("deleted_at", null);
  if (itemsError) {
    return json({ error: itemsError.message }, 500);
  }

  for (const item of items ?? []) {
    const metadata = (item.metadata ?? {}) as Record<string, unknown>;
    if (metadata.reminder_sent === true || metadata.reminder_disabled === true) continue;
    const analysis = metadata.analysis as Record<string, unknown> | undefined;
    if (typeof metadata.reminder_recurrence === "string" && metadata.reminder_recurrence) {
      continue;
    }
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
      await admin
        .from("mindtasker_items")
        .update({
          metadata: { ...metadata, reminder_sent: true },
        })
        .eq("id", item.id);
      sent += 1;
    } catch (error) {
      console.error("reminder item send failed", error);
    }
  }

  const { data: lists, error: listsError } = await admin
    .from("task_lists")
    .select("id, user_id, name, reminder_at")
    .eq("status", "active")
    .is("deleted_at", null)
    .not("reminder_at", "is", null)
    .lte("reminder_at", now);
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

  return json({ ok: true, sent });
});
