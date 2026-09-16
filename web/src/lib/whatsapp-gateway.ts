import { requireSupabase } from "./supabase";

export interface WhatsAppGatewayRow {
  instance_id: string;
  api_url: string;
  last_state: string | null;
  instance_wid: string | null;
  connected_at: string | null;
  updated_at: string;
}

export interface GreenConnectStatus {
  configured: boolean;
  authorized: boolean;
  stateInstance: string | null;
  qrBase64: string | null;
  qrPageUrl: string | null;
  instanceId: string | null;
  webhookUrl: string;
  hint: string;
  ok?: boolean;
}

function newWebhookToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

export async function loadWhatsAppGateway(): Promise<WhatsAppGatewayRow | null> {
  const supabase = requireSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
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
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
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

  const row = {
    user_id: userId,
    provider: "green-api",
    instance_id: instanceId,
    api_token: apiToken,
    api_url: apiUrl,
    webhook_token: newWebhookToken(),
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
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Not authenticated");
  const { error } = await supabase.from("whatsapp_gateways").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function invokeGreenConnect(
  action: "status" | "configureWebhook",
): Promise<GreenConnectStatus> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke("whatsapp-green-connect", {
    body: { action },
  });
  if (error) {
    throw new Error(error.message || "קריאת סטטוס GREEN-API נכשלה");
  }
  return data as GreenConnectStatus;
}
