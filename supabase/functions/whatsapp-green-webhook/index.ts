import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  instanceIdFromPayload,
  parseGreenApiWebhook,
  phoneLookupVariants,
  verifyGreenApiWebhookAuth,
  type ParsedGreenApiMessage,
} from "../_shared/green-api.ts";
import { titleFromInboundText } from "../_shared/voice-text.ts";
import {
  pendingVoiceItem,
  transcribeVoiceMessage,
  type VoiceGatewayCredentials,
} from "../_shared/voice-ingest.ts";
import { evaluateCaptureGate } from "../_shared/capture-gate.ts";
import { parseInboundText, type IngestSourceType } from "../_shared/inbound-item.ts";

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
): Promise<void> {
  const stored = owner.phone?.trim() ?? "";
  if (!stored || owner.phone_verified === true) return;
  if (!phonesMatch(stored, senderPhones)) return;
  await supabase.from("users").update({ phone_verified: true }).eq("id", owner.id);
  owner.phone_verified = true;
}

async function gateCapture(
  supabase: ReturnType<typeof adminClient>,
  user: UserRow,
  chatId: string,
  chatName?: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const decision = evaluateCaptureGate(
    {
      phone: user.phone,
      captureGroupChatId: user.whatsapp_capture_group_chat_id,
      captureGroupName: user.whatsapp_capture_group_name,
    },
    chatId,
    chatName,
  );
  if (!decision.allowed) {
    return { allowed: false, reason: decision.reason };
  }
  if (decision.bind) {
    await supabase
      .from("users")
      .update({
        whatsapp_capture_group_chat_id: decision.bind.chatId,
        whatsapp_capture_group_name: decision.bind.name,
      })
      .eq("id", user.id);
    user.whatsapp_capture_group_chat_id = decision.bind.chatId;
    user.whatsapp_capture_group_name = decision.bind.name;
  }
  return { allowed: true };
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
  gateway: GatewayRow | null,
): Promise<{
  sourceType: "whatsapp_voice";
  title: string;
  content: string;
  rawText: string;
  audioUrl: string | null;
}> {
  try {
    return await transcribeVoiceMessage(message, gateway);
  } catch (error) {
    console.error("voice transcription failed, storing pending item", error);
    return pendingVoiceItem(message.audioUrl ?? null);
  }
}

async function ingestMessage(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  message: ParsedGreenApiMessage,
  gateway: GatewayRow | null,
): Promise<void> {
  if (await alreadyIngested(supabase, userId, message.messageId)) {
    return;
  }
  const item =
    message.type === "audio"
      ? await voiceItemFromMessage(message, gateway)
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

  const sourceType = item.sourceType as IngestSourceType;
  let parsedRows = [] as ReturnType<typeof parseInboundText>;
  try {
    if (item.content.trim()) {
      parsedRows = parseInboundText(item.content, {
        sourceType,
        fallbackTitle: item.title,
      });
    }
  } catch (error) {
    console.error("inbound parse failed, storing raw item", error);
  }

  const rows =
    parsedRows.length > 0
      ? parsedRows
      : [
          {
            title: item.title,
            content: item.content,
            is_actionable: true,
            tags: [] as string[],
            due_date: null as string | null,
            analysis: undefined as unknown,
          },
        ];

  const voiceMeta =
    message.type === "audio"
      ? {
          whisper_transcription: "rawText" in item ? item.rawText : item.content,
          corrected_transcription: item.content,
        }
      : {};

  const { error: itemError } = await supabase.from("mindtasker_items").insert(
    rows.map((row, index) => ({
      user_id: userId,
      source_material_id: source?.id ?? null,
      title: row.title,
      content: row.content,
      is_actionable: row.is_actionable,
      status: "inbox",
      tags: row.tags,
      due_date: row.due_date,
      metadata: {
        source: sourceType,
        analysis: row.analysis,
        whatsapp_message_id: message.messageId,
        chat_id: message.chatId,
        ...voiceMeta,
      },
      sort_order: now + index,
      last_interacted_at: new Date(now).toISOString(),
    })),
  );
  if (itemError) {
    throw new Error(itemError.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    return json({ ok: true, provider: "green-api" });
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
    .select("user_id,webhook_token,instance_id,api_token,api_url")
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
    const gate = await gateCapture(supabase, owner, message.chatId, message.chatName);
    if (!gate.allowed) {
      skipped.push({
        messageId: message.messageId,
        reason: gate.reason ?? "capture_gated",
      });
      continue;
    }
    try {
      await maybeVerifyOwnerPhone(supabase, owner, [
        message.senderPhone,
        message.senderId,
      ]);
      await ingestMessage(supabase, owner.id, message, gateway);
      scheduled.push({
        messageId: message.messageId,
        userId: owner.id,
      });
    } catch {
      skipped.push({
        messageId: message.messageId,
        reason: "ingest_failed",
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
