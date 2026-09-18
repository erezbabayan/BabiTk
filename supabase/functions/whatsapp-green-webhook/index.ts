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

function phonesMatch(stored: string, senderPhones: string[]): boolean {
  try {
    const storedVariants = new Set(phoneLookupVariants(stored));
    for (const phone of senderPhones) {
      if (!phone.trim()) continue;
      for (const candidate of phoneLookupVariants(phone)) {
        if (storedVariants.has(candidate)) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

async function maybeVerifyOwnerPhone(
  supabase: ReturnType<typeof adminClient>,
  owner: UserRow,
  senderPhones: string[],
  chatId: string,
): Promise<void> {
  const stored = owner.phone?.trim() ?? "";
  if (!stored || owner.phone_verified === true) return;
  if (!isPersonalWhatsAppChat(chatId)) return;
  const expected = personalCaptureChatId(stored);
  if (!expected || normalizeGroupChatId(expected) !== normalizeGroupChatId(chatId)) {
    return;
  }
  if (!phonesMatch(stored, senderPhones)) return;
  await supabase.from("users").update({ phone_verified: true }).eq("id", owner.id);
  owner.phone_verified = true;
}

async function captureTakenByOther(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  chatId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("whatsapp_capture_group_chat_id", chatId)
    .neq("id", userId)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
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
  const takenByOther = await captureTakenByOther(supabase, user.id, incoming);

  if (!configured) {
    const expectedPersonal =
      personalId && normalizeGroupChatId(personalId) === incoming;
    if (!expectedPersonal || user.phone_verified !== true) {
      return { allowed: false, reason: "capture_group_not_configured" };
    }
    if (takenByOther) {
      return { allowed: false, reason: "capture_group_taken" };
    }
    await supabase
      .from("users")
      .update({
        whatsapp_capture_group_chat_id: incoming,
        whatsapp_capture_group_name: chatName?.trim() || "הודעה לעצמי (BabiTk)",
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
    if (isDefaultPersonal && !takenByOther) {
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
    return json({ ok: true });
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
  if (!instanceId) {
    return json({ error: "invalid_webhook_token" }, 401);
  }

  const { data } = await supabase
    .from("whatsapp_gateways")
    .select("user_id,webhook_token")
    .eq("instance_id", instanceId)
    .maybeSingle();
  const gateway = (data as GatewayRow | null) ?? null;
  if (!gateway?.webhook_token) {
    return json({ error: "invalid_webhook_token" }, 401);
  }

  if (!verifyGreenApiWebhookAuth(req, gateway.webhook_token)) {
    console.warn("[security]", "webhook_auth_failed", { path: "whatsapp-green-webhook" });
    return json({ error: "invalid_webhook_token" }, 401);
  }

  const { data: ownerData } = await supabase
    .from("users")
    .select(
      "id,phone,phone_verified,whatsapp_capture_group_chat_id,whatsapp_capture_group_name",
    )
    .eq("id", gateway.user_id)
    .maybeSingle();
  const owner = (ownerData as UserRow | null) ?? null;
  if (!owner) {
    return json({ error: "invalid_webhook_token" }, 401);
  }

  const parsed = parseGreenApiWebhook(body);
  if (parsed.ignored || parsed.messages.length === 0) {
    return json({ received: true });
  }

  for (const message of parsed.messages) {
    const gate = await gateCapture(supabase, owner, message.chatId, message.chatName);
    if (!gate.allowed) {
      continue;
    }
    try {
      await maybeVerifyOwnerPhone(
        supabase,
        owner,
        [message.senderPhone],
        message.chatId,
      );
      await ingestMessage(supabase, owner.id, message);
    } catch {
      // Keep processing remaining messages.
    }
  }

  return json({ received: true });
});
