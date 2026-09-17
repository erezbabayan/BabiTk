import { requireSupabase } from "./supabase";

export interface WhatsAppGatewayRow {
  instance_id: string;
  api_url: string;
  last_state: string | null;
  instance_wid: string | null;
  connected_at: string | null;
  updated_at: string;
}

export type GreenConnectAction =
  | "status"
  | "configureWebhook"
  | "pairingCode"
  | "sendWelcome"
  | "ensureInstance";

export interface GreenConnectStatus {
  configured: boolean;
  authorized: boolean;
  stateInstance: string | null;
  qrBase64: string | null;
  qrPageUrl: string | null;
  instanceId: string | null;
  webhookUrl: string;
  webhookConfigured?: boolean;
  hint: string;
  ok?: boolean;
  pairingCode?: string | null;
  pairingPhone?: string | null;
  linkedPhone?: string | null;
  welcomeSent?: boolean;
  canAutoProvision?: boolean;
}

function newWebhookToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function currentAccessToken(): Promise<string | null> {
  const supabase = requireSupabase();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.access_token) {
      return sessionData.session.access_token;
    }
    await sleep(150);
  }
  return null;
}

export async function currentUserId(): Promise<string | null> {
  const supabase = requireSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user.id) {
    return sessionData.session.user.id;
  }
  const { data, error } = await supabase.auth.getUser();
  if (!error && data.user?.id) {
    return data.user.id;
  }
  const token = await currentAccessToken();
  if (!token) return null;
  const { data: retry } = await supabase.auth.getSession();
  return retry.session?.user.id ?? null;
}

export async function loadWhatsAppGateway(): Promise<WhatsAppGatewayRow | null> {
  const supabase = requireSupabase();
  const userId = await currentUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("whatsapp_gateways")
    .select("instance_id,api_url,last_state,instance_wid,connected_at,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as WhatsAppGatewayRow | null) ?? null;
}

export async function saveWhatsAppGateway(input: {
  instanceId: string;
  apiToken: string;
  apiUrl?: string;
}): Promise<WhatsAppGatewayRow> {
  const supabase = requireSupabase();
  const userId = await currentUserId();
  if (!userId) throw new Error("Not authenticated");

  const instanceId = input.instanceId.trim();
  const apiToken = input.apiToken.trim();
  const apiUrl = (input.apiUrl?.trim() || "https://api.greenapi.com").replace(/\/$/, "");
  if (!/^\d+$/.test(instanceId)) {
    throw new Error("Instance ID חייב להיות מספר מ-GREEN-API Console");
  }
  if (apiToken.length < 8) {
    throw new Error("API Token לא תקין");
  }

  const { data: existing } = await supabase
    .from("whatsapp_gateways")
    .select("webhook_token")
    .eq("user_id", userId)
    .maybeSingle();
  const existingToken =
    existing && typeof (existing as { webhook_token?: string }).webhook_token === "string"
      ? (existing as { webhook_token: string }).webhook_token
      : "";

  const row = {
    user_id: userId,
    provider: "green-api",
    instance_id: instanceId,
    api_token: apiToken,
    api_url: apiUrl,
    webhook_token: existingToken || newWebhookToken(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("whatsapp_gateways")
    .upsert(row, { onConflict: "user_id" })
    .select("instance_id,api_url,last_state,instance_wid,connected_at,updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data as WhatsAppGatewayRow;
}

export async function clearWhatsAppGateway(): Promise<void> {
  const supabase = requireSupabase();
  const userId = await currentUserId();
  if (!userId) throw new Error("Not authenticated");
  const { error } = await supabase.from("whatsapp_gateways").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function invokeGreenConnect(
  action: GreenConnectAction,
  extra?: { phone?: string },
): Promise<GreenConnectStatus> {
  const supabase = requireSupabase();
  const accessToken = await currentAccessToken();
  if (!accessToken) {
    throw new Error("Not authenticated");
  }
  const { data, error } = await supabase.functions.invoke("whatsapp-green-connect", {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { action, phone: extra?.phone },
  });
  if (error) {
    throw new Error(error.message || "קריאת סטטוס GREEN-API נכשלה");
  }
  if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
    throw new Error(String((data as { error: string }).error));
  }
  return data as GreenConnectStatus;
}
