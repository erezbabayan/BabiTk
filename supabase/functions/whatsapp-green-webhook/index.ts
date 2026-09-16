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
import { titleFromInboundText, needsVoiceTranscription } from "../_shared/voice-text.ts";
import {
  findVoiceItemByWhatsAppMessage,
  pendingVoiceItem,
  scheduleBackgroundWork,
  transcribeStoredVoiceItem,
  type VoiceGatewayCredentials,
  type VoiceItemRow,
} from "../_shared/voice-ingest.ts";

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

interface GatewayRow extends VoiceGatewayCredentials {
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
  gateway: GatewayRow | null,
): Promise<boolean> {
  const existing = await findVoiceItemByWhatsAppMessage(supabase, userId, messageId);
  if (!existing) return false;
  queueVoiceTranscription(supabase, existing, gateway);
  return true;
}

function itemFromMessage(message: ParsedGreenApiMessage): {
  sourceType: "whatsapp_text" | "whatsapp_voice" | "image";
  title: string;
  content: string;
} {
  if (message.type === "image") {
    const content = message.text?.trim() || "תמונה מוואטסאפ";
    return {
      sourceType: "image",
      title: titleFromInboundText(content),
      content,
    };
  }
  const content = message.text?.trim() || "פריט מוואטסאפ";
  return {
    sourceType: "whatsapp_text",
    title: titleFromInboundText(content),
    content,
  };
}

async function voiceItemFromMessage(
  message: ParsedGreenApiMessage,
): Promise<{
  sourceType: "whatsapp_voice";
  title: string;
  content: string;
  rawText: string;
  audioUrl: string | null;
}> {
  // Never block Green-API on Whisper. Insert a pending row and transcribe after ACK.
  return pendingVoiceItem(message.audioUrl ?? null);
}

function queueVoiceTranscription(
  supabase: ReturnType<typeof adminClient>,
  row: VoiceItemRow,
  gateway: GatewayRow | null,
): void {
  if (!needsVoiceTranscription(row.title, row.content)) return;
  scheduleBackgroundWork(transcribeStoredVoiceItem(supabase, row, gateway));
}

async function ingestMessage(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  message: ParsedGreenApiMessage,
  gateway: GatewayRow | null,
): Promise<void> {
  if (await alreadyIngested(supabase, userId, message.messageId, gateway)) {
    return;
  }
  const item =
    message.type === "audio"
      ? await voiceItemFromMessage(message)
      : itemFromMessage(message);
  const now = Date.now();
  const { data: source, error: sourceError } = await supabase
    .from("source_materials")
    .insert({
      user_id: userId,
      source_type: item.sourceType,
      raw_text: "rawText" in item ? item.rawText : item.content,
      storage_url:
        message.type === "audio"
          ? ("audioUrl" in item ? item.audioUrl : message.audioUrl) ?? null
          : message.imageUrl ?? null,
      metadata: {
        whatsapp_message_id: message.messageId,
        chat_id: message.chatId,
        channel: "whatsapp",
        ...(message.type === "audio"
          ? {
              whisper_transcription: "rawText" in item ? item.rawText : item.content,
              corrected_transcription: item.content,
            }
          : {}),
      },
    })
    .select("id")
    .single();
  if (sourceError) {
    throw new Error(sourceError.message);
  }

  const { data: inserted, error: itemError } = await supabase
    .from("mindtasker_items")
    .insert({
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
        ...(message.type === "audio"
          ? {
              whisper_transcription: "rawText" in item ? item.rawText : item.content,
              corrected_transcription: item.content,
            }
          : {}),
      },
      sort_order: now,
      last_interacted_at: new Date(now).toISOString(),
    })
    .select("id, title, content, metadata, source_material_id")
    .single();
  if (itemError || !inserted) {
    throw new Error(itemError?.message ?? "item_insert_failed");
  }

  if (message.type === "audio") {
    const storageUrl =
      ("audioUrl" in item ? item.audioUrl : message.audioUrl) ?? null;
    queueVoiceTranscription(
      supabase,
      {
        id: inserted.id as string,
        title: inserted.title as string,
        content: inserted.content as string,
        metadata: (inserted.metadata as Record<string, unknown> | null) ?? null,
        source_material_id: source?.id ?? null,
        source_materials: source?.id
          ? {
              id: source.id,
              storage_url: storageUrl,
              metadata: {
                whatsapp_message_id: message.messageId,
                chat_id: message.chatId,
              },
            }
          : null,
      },
      gateway,
    );
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
      .select("user_id,webhook_token,instance_id,api_token,api_url")
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
    if (!gateway) {
      const { data } = await supabase
        .from("whatsapp_gateways")
        .select("user_id,webhook_token,instance_id,api_token,api_url")
        .eq("user_id", user.id)
        .maybeSingle();
      gateway = (data as GatewayRow | null) ?? null;
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
      await ingestMessage(supabase, user.id, message, gateway);
      scheduled.push({
        messageId: message.messageId,
        userId: user.id,
      });
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
