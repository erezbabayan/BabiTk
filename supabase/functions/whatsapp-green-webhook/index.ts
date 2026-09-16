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
import { resolveGreenApiMediaUrl } from "../_shared/green-api-media.ts";
import {
  audioFileName,
  downloadAudioBytes,
  transcribeAndProofreadVoice,
} from "../_shared/hebrew-voice-asr.ts";
import { isVoicePlaceholderText, titleFromInboundText } from "../_shared/voice-text.ts";

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
  instance_id: string;
  api_token: string;
  api_url: string;
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

async function transcribeVoiceMessage(
  message: ParsedGreenApiMessage,
  gateway: GatewayRow | null,
): Promise<{
  sourceType: "whatsapp_voice";
  title: string;
  content: string;
  rawText: string;
  audioUrl: string | null;
}> {
  const audioUrl = await resolveGreenApiMediaUrl({
    downloadUrl: message.audioUrl,
    chatId: message.chatId,
    messageId: message.messageId,
    credentials: gateway
      ? {
          instanceId: gateway.instance_id,
          apiToken: gateway.api_token,
          apiUrl: gateway.api_url,
        }
      : null,
  });
  if (!audioUrl) {
    throw new Error("voice_audio_url_missing");
  }
  const downloaded = await downloadAudioBytes(audioUrl);
  const mimeType = message.mimeType || downloaded.mimeType;
  const transcribed = await transcribeAndProofreadVoice({
    audio: downloaded.bytes,
    mimeType,
    fileName: audioFileName(message.messageId, mimeType),
  });
  if (isVoicePlaceholderText(transcribed.correctedText)) {
    throw new Error("voice_placeholder_rejected");
  }
  return {
    sourceType: "whatsapp_voice",
    title: transcribed.title,
    content: transcribed.correctedText,
    rawText: transcribed.rawText,
    audioUrl,
  };
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
      ? await transcribeVoiceMessage(message, gateway)
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
      ...(message.type === "audio"
        ? {
            whisper_transcription: "rawText" in item ? item.rawText : item.content,
            corrected_transcription: item.content,
          }
        : {}),
    },
    sort_order: now,
    last_interacted_at: new Date(now).toISOString(),
  });
  if (itemError) {
    throw new Error(itemError.message);
  }
}

async function reprocessPlaceholderVoiceItems(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  gateway: GatewayRow | null,
): Promise<number> {
  const { data, error } = await supabase
    .from("mindtasker_items")
    .select(
      "id, title, content, metadata, source_material_id, source_materials ( id, storage_url, metadata )",
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .or("title.eq.הודעה קולית מוואטסאפ,content.eq.הודעה קולית מוואטסאפ,title.eq.הודעה קולית,content.eq.הודעה קולית");
  if (error || !data) return 0;

  let updated = 0;
  for (const row of data) {
    if (!isVoicePlaceholderText(row.title) && !isVoicePlaceholderText(row.content)) {
      continue;
    }
    const source = Array.isArray(row.source_materials)
      ? row.source_materials[0]
      : row.source_materials;
    const storageUrl =
      (source && typeof source === "object" && "storage_url" in source
        ? String(source.storage_url ?? "")
        : "") || "";
    const messageId =
      typeof row.metadata === "object" && row.metadata && "whatsapp_message_id" in row.metadata
        ? String(row.metadata.whatsapp_message_id ?? "")
        : "";
    const chatId =
      typeof row.metadata === "object" && row.metadata && "chat_id" in row.metadata
        ? String(row.metadata.chat_id ?? "")
        : "";
    try {
      const transcribed = await transcribeVoiceMessage(
        {
          messageId: messageId || row.id,
          senderId: "",
          senderPhone: "",
          chatId,
          direction: "incoming",
          type: "audio",
          audioUrl: storageUrl || undefined,
        },
        gateway,
      );
      const { error: itemError } = await supabase
        .from("mindtasker_items")
        .update({
          title: transcribed.title,
          content: transcribed.content,
          last_interacted_at: new Date().toISOString(),
          metadata: {
            ...(typeof row.metadata === "object" && row.metadata ? row.metadata : {}),
            source: "whatsapp_voice",
            whisper_transcription: transcribed.rawText,
            corrected_transcription: transcribed.content,
          },
        })
        .eq("id", row.id);
      if (itemError) continue;
      if (source && typeof source === "object" && "id" in source && source.id) {
        await supabase
          .from("source_materials")
          .update({
            raw_text: transcribed.rawText,
            storage_url: transcribed.audioUrl ?? storageUrl,
            metadata: {
              ...(typeof source.metadata === "object" && source.metadata ? source.metadata : {}),
              whisper_transcription: transcribed.rawText,
              corrected_transcription: transcribed.content,
            },
          })
          .eq("id", source.id);
      }
      updated += 1;
    } catch {
      // Keep the placeholder until audio/ASR is available.
    }
  }
  return updated;
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

  if (gateway) {
    await reprocessPlaceholderVoiceItems(supabase, gateway.user_id, gateway);
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

  const scheduled: Array<{ messageId: string; userId: string; reprocessed?: number }> = [];
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
      const reprocessed = await reprocessPlaceholderVoiceItems(
        supabase,
        user.id,
        gateway,
      );
      scheduled.push({
        messageId: message.messageId,
        userId: user.id,
        ...(reprocessed > 0 ? { reprocessed } : {}),
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
