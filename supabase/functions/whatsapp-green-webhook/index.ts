import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  instanceIdFromPayload,
  isGroupWhatsAppChat,
  isPersonalWhatsAppChat,
  normalizeGroupChatId,
  parseGreenApiWebhook,
  personalCaptureChatId,
  phoneLookupVariants,
  verifyGreenApiWebhookAuth,
  type ParsedGreenApiMessage,
} from "../_shared/green-api.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function adminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error("missing_supabase_env");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface UserRow {
  id: string;
  phone: string | null;
  phone_verified: boolean;
  whatsapp_capture_group_chat_id: string | null;
  whatsapp_capture_group_name: string | null;
}

interface GatewayRow {
  user_id: string;
  webhook_token: string | null;
}

async function findVerifiedUser(
  supabase: ReturnType<typeof adminClient>,
  phones: string[],
): Promise<UserRow | null> {
  const variants = new Set<string>();
  for (const phone of phones) {
    if (!phone.trim()) continue;
    try {
      for (const variant of phoneLookupVariants(phone)) {
        variants.add(variant);
      }
    } catch {
      // skip unparseable
    }
  }
  for (const candidate of variants) {
    const { data } = await supabase
      .from("users")
      .select(
        "id,phone,phone_verified,whatsapp_capture_group_chat_id,whatsapp_capture_group_name",
      )
      .eq("phone", candidate)
      .maybeSingle();
    if (data && (data as UserRow).phone_verified) {
      return data as UserRow;
    }
  }
  return null;
}

async function gateCapture(
  supabase: ReturnType<typeof adminClient>,
  user: UserRow,
  chatId: string,
  chatName?: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const incoming = normalizeGroupChatId(chatId);
  const configured = user.whatsapp_capture_group_chat_id?.trim() ?? "";
  const configuredName = user.whatsapp_capture_group_name?.trim() ?? "";
  const personalId = personalCaptureChatId(user.phone);

  if (configuredName && chatName?.trim() && configuredName === chatName.trim()) {
    if (configured !== incoming) {
      await supabase
        .from("users")
        .update({
          whatsapp_capture_group_chat_id: incoming,
          whatsapp_capture_group_name: configuredName,
        })
        .eq("id", user.id);
    }
    return { allowed: true };
  }

  if (!configured) {
    await supabase
      .from("users")
      .update({
        whatsapp_capture_group_chat_id: incoming,
        whatsapp_capture_group_name: chatName?.trim() || configuredName || null,
      })
      .eq("id", user.id);
    return { allowed: true };
  }

  const configuredNorm = normalizeGroupChatId(configured);
  if (configuredNorm === incoming) {
    return { allowed: true };
  }

  if (
    isGroupWhatsAppChat(configuredNorm) &&
    personalId &&
    normalizeGroupChatId(personalId) === incoming
  ) {
    return { allowed: true };
  }

  if (isPersonalWhatsAppChat(configuredNorm) && isGroupWhatsAppChat(incoming)) {
    const name = configuredName;
    const isDefaultPersonal =
      !name ||
      name.includes("הודעה לעצמי") ||
      name.toLowerCase().includes("babitk") ||
      name.toLowerCase().includes("message yourself");
    if (isDefaultPersonal) {
      await supabase
        .from("users")
        .update({
          whatsapp_capture_group_chat_id: incoming,
          whatsapp_capture_group_name: chatName?.trim() || "קבוצת קליטה",
        })
        .eq("id", user.id);
      return { allowed: true };
    }
  }

  return { allowed: false, reason: "wrong_capture_group" };
}

async function alreadyIngested(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  messageId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("mindtasker_items")
    .select("id")
    .eq("user_id", userId)
    .filter("metadata->>whatsapp_message_id", "eq", messageId)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

function itemFromMessage(message: ParsedGreenApiMessage): {
  sourceType: "whatsapp_text" | "whatsapp_voice" | "image";
  title: string;
  content: string;
} {
  if (message.type === "audio") {
    const content = message.text?.trim() || "הודעה קולית מוואטסאפ";
    return {
      sourceType: "whatsapp_voice",
      title: content.slice(0, 120),
      content,
    };
  }
  if (message.type === "image") {
    const content = message.text?.trim() || "תמונה מוואטסאפ";
    return {
      sourceType: "image",
      title: content.slice(0, 120),
      content,
    };
  }
  const content = message.text?.trim() || "פריט מוואטסאפ";
  const firstLine = content.split(/\r?\n/).find((line) => line.trim()) ?? content;
  return {
    sourceType: "whatsapp_text",
    title: firstLine.trim().slice(0, 120),
    content,
  };
}

async function ingestMessage(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  message: ParsedGreenApiMessage,
): Promise<void> {
  if (await alreadyIngested(supabase, userId, message.messageId)) {
    return;
  }
  const item = itemFromMessage(message);
  const now = Date.now();
  const { data: source, error: sourceError } = await supabase
    .from("source_materials")
    .insert({
      user_id: userId,
      source_type: item.sourceType,
      raw_text: item.content,
      storage_url: message.audioUrl ?? message.imageUrl ?? null,
      metadata: {
        whatsapp_message_id: message.messageId,
        chat_id: message.chatId,
        channel: "whatsapp",
      },
    })
    .select("id")
    .single();
  if (sourceError) {
    throw new Error(sourceError.message);
  }

  const { error: itemError } = await supabase.from("mindtasker_items").insert({
    user_id: userId,
    source_material_id: source?.id ?? null,
    title: item.title,
    content: item.content,
    is_actionable: true,
    status: "inbox",
    tags: [],
    metadata: {
      source: item.sourceType,
      whatsapp_message_id: message.messageId,
      chat_id: message.chatId,
    },
    sort_order: now,
    last_interacted_at: new Date(now).toISOString(),
  });
  if (itemError) {
    throw new Error(itemError.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    return json({
      ok: true,
      provider: "green-api",
      endpoint: "whatsapp-green-webhook",
      method: "POST",
    });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const supabase = adminClient();
  const instanceId = instanceIdFromPayload(body);
  let gateway: GatewayRow | null = null;
  if (instanceId) {
    const { data } = await supabase
      .from("whatsapp_gateways")
      .select("user_id,webhook_token")
      .eq("instance_id", instanceId)
      .maybeSingle();
    gateway = (data as GatewayRow | null) ?? null;
  }

  if (!verifyGreenApiWebhookAuth(req, gateway?.webhook_token ?? undefined)) {
    return json({ error: "invalid_webhook_token" }, 401);
  }

  const parsed = parseGreenApiWebhook(body);
  if (parsed.ignored) {
    return json({ received: true, ignored: true, reason: parsed.reason ?? "not_inbound" });
  }
  if (parsed.messages.length === 0) {
    return json({
      received: true,
      messages: [],
      note: parsed.reason ?? "no_actionable_content",
    });
  }

  const scheduled: Array<{ messageId: string; userId: string }> = [];
  const skipped: Array<{ messageId: string; reason: string }> = [];

  for (const message of parsed.messages) {
    const payload = body as {
      instanceData?: { wid?: string };
      senderData?: { sender?: string };
    };
    const user = await findVerifiedUser(supabase, [
      message.senderPhone,
      payload.instanceData?.wid ?? "",
      payload.senderData?.sender ?? "",
    ]);
    if (!user) {
      skipped.push({ messageId: message.messageId, reason: "not_linked" });
      continue;
    }
    const gate = await gateCapture(supabase, user, message.chatId, message.chatName);
    if (!gate.allowed) {
      skipped.push({
        messageId: message.messageId,
        reason: gate.reason ?? "capture_gated",
      });
      continue;
    }
    try {
      await ingestMessage(supabase, user.id, message);
      scheduled.push({ messageId: message.messageId, userId: user.id });
    } catch (error) {
      skipped.push({
        messageId: message.messageId,
        reason: error instanceof Error ? error.message : "ingest_failed",
      });
    }
  }

  return json({
    received: true,
    provider: "green-api",
    scheduled,
    skipped,
  });
});
