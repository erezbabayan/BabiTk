import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
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

interface GatewayRow {
  instance_id: string;
  api_token: string;
  api_url: string;
  webhook_token: string | null;
  instance_wid: string | null;
  last_state: string | null;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
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
  try {
    const body = (await req.json()) as { action?: string };
    if (typeof body.action === "string" && body.action.trim()) {
      action = body.action.trim();
    }
  } catch {
    action = "status";
  }

  const { data: gatewayData } = await supabase
    .from("whatsapp_gateways")
    .select("instance_id,api_token,api_url,webhook_token,instance_wid,last_state")
    .eq("user_id", userId)
    .maybeSingle();
  const gateway = gatewayData as GatewayRow | null;

  if (!gateway) {
    return json({
      configured: false,
      authorized: false,
      stateInstance: null,
      qrBase64: null,
      qrPageUrl: null,
      instanceId: null,
      webhookUrl: `${SUPABASE_URL}/functions/v1/whatsapp-green-webhook`,
      hint: "צרו instance חינמי ב-GREEN-API והדביקו כאן Instance ID ו-API Token.",
    });
  }

  const qrPageUrl = `https://qr.green-api.com/waInstance${gateway.instance_id}/${gateway.api_token}`;
  const webhookUrl = webhookPublicUrl(
    gateway.webhook_token || "missing",
  );

  if (action === "configureWebhook") {
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
    if (!response.ok) {
      return json(
        {
          ok: false,
          webhookUrl,
          reason: "set_settings_failed",
          saveSettings,
        },
        502,
      );
    }
    return json({ ok: true, webhookUrl, saveSettings });
  }

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

  await supabase
    .from("whatsapp_gateways")
    .update({
      last_state: stateInstance,
      instance_wid: instanceWid,
      connected_at: authorized ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return json({
    configured: true,
    authorized,
    stateInstance,
    qrBase64,
    qrPageUrl,
    instanceId: gateway.instance_id,
    webhookUrl,
    hint: authorized
      ? "הוואטסאפ מחובר. שלחו הודעה לקבוצת הקליטה או «הודעה לעצמי»."
      : "סרקו את ה-QR עם וואטסאפ → מכשירים מקושרים.",
  });
});
