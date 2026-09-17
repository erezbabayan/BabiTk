import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  loadVoiceItemForUser,
  transcribeStoredVoiceItem,
  ingestRecordedAudio,
  type VoiceGatewayCredentials,
} from "../_shared/voice-ingest.ts";
import { needsVoiceTranscription } from "../_shared/voice-text.ts";
import { decodeAudioBase64, audioFileName } from "../_shared/hebrew-voice-asr.ts";
import {
  parseAuthorizationCodeResponse,
  phoneDigitsForGreenApi,
  phoneFromWid,
  WHATSAPP_PAIRING_HINT,
  WHATSAPP_SCAN_HINT,
  WHATSAPP_WELCOME_MESSAGE,
} from "../_shared/green-api-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PARTNER_TOKEN = Deno.env.get("GREEN_API_PARTNER_TOKEN")?.trim() ?? "";
const DEFAULT_GREEN_URL = "https://api.greenapi.com";

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

function webhookPublicUrl(webhookToken: string): string {
  const token = encodeURIComponent(webhookToken);
  return `${SUPABASE_URL}/functions/v1/whatsapp-green-webhook?token=${token}`;
}

function greenUrl(baseUrl: string, instanceId: string, method: string, token: string): string {
  const base = baseUrl.replace(/\/$/, "") || DEFAULT_GREEN_URL;
  return `${base}/waInstance${instanceId}/${method}/${token}`;
}

function newWebhookToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function canAutoProvision(): boolean {
  return PARTNER_TOKEN.length > 8;
}

interface GatewayRow {
  instance_id: string;
  api_token: string;
  api_url: string;
  webhook_token: string | null;
  instance_wid: string | null;
  last_state: string | null;
  connected_at: string | null;
}

interface ConnectStatus {
  configured: boolean;
  authorized: boolean;
  stateInstance: string | null;
  qrBase64: string | null;
  qrPageUrl: string | null;
  instanceId: string | null;
  webhookUrl: string;
  webhookConfigured: boolean;
  hint: string;
  ok?: boolean;
  pairingCode: string | null;
  pairingPhone: string | null;
  linkedPhone: string | null;
  welcomeSent: boolean;
  canAutoProvision: boolean;
}

function emptyStatus(partial: Partial<ConnectStatus> = {}): ConnectStatus {
  return {
    configured: false,
    authorized: false,
    stateInstance: null,
    qrBase64: null,
    qrPageUrl: null,
    instanceId: null,
    webhookUrl: `${SUPABASE_URL}/functions/v1/whatsapp-green-webhook`,
    webhookConfigured: false,
    hint: canAutoProvision()
      ? "הזינו מספר וואטסאפ או סרקו QR — נחבר את המכשיר."
      : "צרו instance חינמי ב-GREEN-API והדביקו Instance ID ו-API Token (פעם אחת).",
    pairingCode: null,
    pairingPhone: null,
    linkedPhone: null,
    welcomeSent: false,
    canAutoProvision: canAutoProvision(),
    ...partial,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function configureWebhook(
  gateway: GatewayRow,
  webhookUrl: string,
): Promise<{ ok: boolean; saveSettings: unknown }> {
  const url = greenUrl(
    gateway.api_url,
    gateway.instance_id,
    "setSettings",
    gateway.api_token,
  );
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookUrl,
      incomingWebhook: "yes",
      outgoingWebhook: "yes",
      outgoingMessageWebhook: "yes",
      enableMessagesHistory: "yes",
      outgoingAPIMessageWebhook: "no",
      stateWebhook: "yes",
      keepOnlineStatus: "yes",
      markIncomingMessagesReaded: "no",
      markIncomingMessagesReadedOnReply: "no",
    }),
  });
  const saveSettings = await readJson(response);
  return { ok: response.ok, saveSettings };
}

async function sendWelcomeMessage(gateway: GatewayRow, digits: string): Promise<boolean> {
  const url = greenUrl(gateway.api_url, gateway.instance_id, "sendMessage", gateway.api_token);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId: `${digits}@c.us`,
      message: WHATSAPP_WELCOME_MESSAGE,
    }),
  });
  return response.ok;
}

async function linkUserPhone(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  linkedPhone: string,
): Promise<void> {
  const { data } = await supabase
    .from("users")
    .select("phone,phone_verified,whatsapp_capture_group_chat_id,whatsapp_capture_group_name")
    .eq("id", userId)
    .maybeSingle();
  const row = (data ?? null) as {
    phone?: string | null;
    phone_verified?: boolean;
    whatsapp_capture_group_chat_id?: string | null;
    whatsapp_capture_group_name?: string | null;
  } | null;
  const patch: Record<string, unknown> = {};
  if (!row?.phone_verified || !row.phone) {
    patch.phone = linkedPhone;
    patch.phone_verified = true;
  }
  if (!row?.whatsapp_capture_group_chat_id) {
    const digits = linkedPhone.replace(/\D/g, "");
    if (digits.length >= 10) {
      patch.whatsapp_capture_group_chat_id = `${digits}@c.us`;
      patch.whatsapp_capture_group_name = row?.whatsapp_capture_group_name ?? "הודעה לעצמי (BabiTk)";
    }
  }
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("users").update(patch).eq("id", userId);
  if (error) {
    console.error("whatsapp phone link failed", error.message);
  }
}

async function readConnectStatus(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  gateway: GatewayRow,
  webhookUrl: string,
  webhookConfigured: boolean,
  extras: {
    pairingCode?: string | null;
    pairingPhone?: string | null;
    sendWelcome?: boolean;
  } = {},
): Promise<ConnectStatus> {
  const qrPageUrl = `https://qr.green-api.com/waInstance${gateway.instance_id}/${gateway.api_token}`;
  const stateRes = await fetch(
    greenUrl(gateway.api_url, gateway.instance_id, "getStateInstance", gateway.api_token),
  );
  const stateJson = (await readJson(stateRes)) as { stateInstance?: string };
  const stateInstance =
    typeof stateJson.stateInstance === "string" ? stateJson.stateInstance : null;
  const authorized = stateInstance === "authorized";

  let qrBase64: string | null = null;
  if (!authorized) {
    const qrRes = await fetch(
      greenUrl(gateway.api_url, gateway.instance_id, "qr", gateway.api_token),
    );
    const qrJson = (await readJson(qrRes)) as { type?: string; message?: string };
    if (qrJson.type === "qrCode" && typeof qrJson.message === "string") {
      qrBase64 = qrJson.message;
    }
  }

  let instanceWid = gateway.instance_wid;
  if (authorized && !instanceWid) {
    const waRes = await fetch(
      greenUrl(gateway.api_url, gateway.instance_id, "getWaSettings", gateway.api_token),
    );
    const waJson = (await readJson(waRes)) as { wid?: string; phone?: string };
    instanceWid = waJson.wid ?? waJson.phone ?? null;
  }

  const linkedPhone = phoneFromWid(instanceWid) ?? extras.pairingPhone ?? null;
  let welcomeSent = false;
  const shouldWelcome = authorized && Boolean(linkedPhone) && (extras.sendWelcome || !gateway.connected_at);
  if (shouldWelcome && linkedPhone) {
    welcomeSent = await sendWelcomeMessage(gateway, linkedPhone.replace(/\D/g, ""));
    await linkUserPhone(supabase, userId, linkedPhone);
  } else if (authorized && linkedPhone) {
    await linkUserPhone(supabase, userId, linkedPhone);
  }

  await supabase
    .from("whatsapp_gateways")
    .update({
      last_state: stateInstance,
      instance_wid: instanceWid,
      connected_at: authorized
        ? gateway.connected_at || new Date().toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return {
    configured: true,
    authorized,
    stateInstance,
    qrBase64,
    qrPageUrl,
    instanceId: gateway.instance_id,
    webhookUrl,
    webhookConfigured,
    hint: authorized
      ? welcomeSent
        ? "הוואטסאפ מחובר. נשלחה הודעת אישור לוואטסאפ."
        : "הוואטסאפ מחובר. שלחו הודעה לקבוצת הקליטה או «הודעה לעצמי»."
      : extras.pairingCode
        ? WHATSAPP_PAIRING_HINT
        : WHATSAPP_SCAN_HINT,
    ok: true,
    pairingCode: extras.pairingCode ?? null,
    pairingPhone: extras.pairingPhone ?? null,
    linkedPhone,
    welcomeSent,
    canAutoProvision: canAutoProvision(),
  };
}

async function loadGateway(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<GatewayRow | null> {
  const { data } = await supabase
    .from("whatsapp_gateways")
    .select("instance_id,api_token,api_url,webhook_token,instance_wid,last_state,connected_at")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as GatewayRow | null) ?? null;
}

async function saveGatewayRow(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  row: {
    instanceId: string;
    apiToken: string;
    apiUrl: string;
    webhookToken: string;
  },
): Promise<GatewayRow> {
  const payload = {
    user_id: userId,
    provider: "green-api",
    instance_id: row.instanceId,
    api_token: row.apiToken,
    api_url: row.apiUrl,
    webhook_token: row.webhookToken,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("whatsapp_gateways")
    .upsert(payload, { onConflict: "user_id" })
    .select("instance_id,api_token,api_url,webhook_token,instance_wid,last_state,connected_at")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "שמירת החיבור נכשלה");
  }
  return data as GatewayRow;
}

async function createPartnerInstance(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<GatewayRow | null> {
  if (!canAutoProvision()) return null;
  const webhookToken = newWebhookToken();
  const webhookUrl = webhookPublicUrl(webhookToken);
  const response = await fetch(
    `https://api.green-api.com/partner/createInstance/${PARTNER_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `BabiTk ${userId.slice(0, 8)}`,
        webhookUrl,
        webhookUrlToken: webhookToken,
        incomingWebhook: "yes",
        outgoingWebhook: "yes",
        outgoingMessageWebhook: "yes",
        enableMessagesHistory: "yes",
        stateWebhook: "yes",
        keepOnlineStatus: "yes",
      }),
    },
  );
  const created = (await readJson(response)) as {
    idInstance?: number | string;
    apiTokenInstance?: string;
  };
  const instanceId = created.idInstance != null ? String(created.idInstance).trim() : "";
  const apiToken = created.apiTokenInstance?.trim() ?? "";
  if (!response.ok || !instanceId || !apiToken) {
    console.error("GREEN-API createInstance failed", created);
    return null;
  }
  const gateway = await saveGatewayRow(supabase, userId, {
    instanceId,
    apiToken,
    apiUrl: DEFAULT_GREEN_URL,
    webhookToken,
  });
  await configureWebhook(gateway, webhookUrl);
  return gateway;
}

async function ensureGateway(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  existing: GatewayRow | null,
): Promise<GatewayRow | null> {
  if (existing) return existing;
  return await createPartnerInstance(supabase, userId);
}

async function requestPairingCode(
  gateway: GatewayRow,
  phone: string,
): Promise<{ code: string | null; pairingPhone: string; hint: string }> {
  const digits = phoneDigitsForGreenApi(phone);
  const pairingPhone = `+${digits}`;
  const response = await fetch(
    greenUrl(gateway.api_url, gateway.instance_id, "getAuthorizationCode", gateway.api_token),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: digits }),
    },
  );
  const raw = await readJson(response);
  const parsed = parseAuthorizationCodeResponse(raw);
  if (!parsed.ok) {
    const reason =
      raw && typeof raw === "object" && "error" in raw && typeof (raw as { error?: unknown }).error === "string"
        ? (raw as { error: string }).error
        : "לא הצלחנו להפיק קוד חיבור. נסו סריקת QR במחשב.";
    return { code: null, pairingPhone, hint: reason };
  }
  return { code: parsed.code, pairingPhone, hint: WHATSAPP_PAIRING_HINT };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return json({ ok: true });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "not_authenticated" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: "not_authenticated" }, 401);
  }
  const userId = userData.user.id;

  let action = "status";
  let itemId = "";
  let audioBase64 = "";
  let mimeType = "audio/webm";
  let fileName = "";
  let durationSeconds: number | undefined;
  let phone = "";
  try {
    const body = (await req.json()) as {
      action?: string;
      itemId?: string;
      audioBase64?: string;
      mimeType?: string;
      fileName?: string;
      durationSeconds?: number;
      phone?: string;
    };
    if (typeof body.action === "string" && body.action.trim()) {
      action = body.action.trim();
    }
    if (typeof body.itemId === "string") {
      itemId = body.itemId.trim();
    }
    if (typeof body.audioBase64 === "string") {
      audioBase64 = body.audioBase64;
    }
    if (typeof body.mimeType === "string" && body.mimeType.trim()) {
      mimeType = body.mimeType.trim();
    }
    if (typeof body.fileName === "string") {
      fileName = body.fileName.trim();
    }
    if (typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)) {
      durationSeconds = Math.max(1, Math.round(body.durationSeconds));
    }
    if (typeof body.phone === "string") {
      phone = body.phone.trim();
    }
  } catch {
    action = "status";
  }

  let gateway = await loadGateway(supabase, userId);

  if (action === "ingestVoice") {
    if (!audioBase64) {
      return json({ error: "audio_required" }, 400);
    }
    if (!SERVICE_ROLE) {
      return json({ error: "missing_supabase_env" }, 500);
    }
    let bytes: Uint8Array;
    try {
      bytes = decodeAudioBase64(audioBase64);
    } catch (error) {
      return json(
        { error: "invalid_audio", reason: error instanceof Error ? error.message : "decode_failed" },
        400,
      );
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    try {
      const result = await ingestRecordedAudio(admin, userId, {
        bytes,
        mimeType,
        fileName: fileName || audioFileName(`rec-${Date.now()}`, mimeType),
        durationSeconds,
      });
      return json({
        ok: true,
        itemId: result.itemId,
        title: result.title,
        content: result.content,
        text: result.content,
      });
    } catch (error) {
      return json(
        {
          error: "transcription_failed",
          reason: error instanceof Error ? error.message : "unknown",
        },
        502,
      );
    }
  }

  if (action === "transcribeItem") {
    if (!itemId) {
      return json({ error: "item_id_required" }, 400);
    }
    if (!SERVICE_ROLE) {
      return json({ error: "missing_supabase_env" }, 500);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const row = await loadVoiceItemForUser(admin, userId, itemId);
    if (!row) {
      return json({ error: "item_not_found" }, 404);
    }
    if (!needsVoiceTranscription(row.title, row.content)) {
      return json({
        ok: true,
        itemId: row.id,
        title: row.title,
        content: row.content,
        alreadyTranscribed: true,
      });
    }
    const { data: adminGateway } = await admin
      .from("whatsapp_gateways")
      .select("instance_id,api_token,api_url")
      .eq("user_id", userId)
      .maybeSingle();
    try {
      const transcribed = await transcribeStoredVoiceItem(
        admin,
        row,
        (adminGateway as VoiceGatewayCredentials | null) ??
          (gateway as VoiceGatewayCredentials | null),
      );
      return json({
        ok: true,
        itemId: row.id,
        title: transcribed.title,
        content: transcribed.content,
      });
    } catch (error) {
      return json(
        {
          error: "transcription_failed",
          reason: error instanceof Error ? error.message : "unknown",
        },
        502,
      );
    }
  }

  if (action === "ensureInstance" || action === "pairingCode") {
    try {
      gateway = await ensureGateway(supabase, userId, gateway);
    } catch (error) {
      return json(
        emptyStatus({
          hint: error instanceof Error ? error.message : "יצירת חיבור וואטסאפ נכשלה",
        }),
      );
    }
  }

  if (!gateway) {
    return json(
      emptyStatus({
        hint: canAutoProvision()
          ? "לא הצלחנו לפתוח חיבור אוטומטי. נסו שוב, או הזינו מפתחות GREEN-API."
          : "צרו instance חינמי ב-GREEN-API והדביקו Instance ID ו-API Token (פעם אחת).",
      }),
    );
  }

  const webhookUrl = webhookPublicUrl(gateway.webhook_token || "missing");
  let webhookConfigured = action !== "configureWebhook";
  if (action === "configureWebhook") {
    const result = await configureWebhook(gateway, webhookUrl);
    webhookConfigured = result.ok;
  }

  if (action === "pairingCode") {
    if (!phone) {
      return json({ error: "הזינו מספר וואטסאפ", hint: "הזינו מספר וואטסאפ" }, 400);
    }
    let pairing;
    try {
      pairing = await requestPairingCode(gateway, phone);
    } catch (error) {
      return json(
        {
          error: "pairing_failed",
          hint: error instanceof Error ? error.message : "מספר טלפון לא תקין",
        },
        400,
      );
    }
    const status = await readConnectStatus(supabase, userId, gateway, webhookUrl, webhookConfigured, {
      pairingCode: pairing.code,
      pairingPhone: pairing.pairingPhone,
    });
    return json({
      ...status,
      hint: pairing.code ? pairing.hint : pairing.hint,
      pairingCode: pairing.code,
      pairingPhone: pairing.pairingPhone,
    });
  }

  const status = await readConnectStatus(supabase, userId, gateway, webhookUrl, webhookConfigured, {
    sendWelcome: action === "sendWelcome",
  });
  return json(status);
});
