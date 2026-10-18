const WEBHOOK_URL = `${String(import.meta.env?.VITE_SUPABASE_URL ?? "").replace(/\/$/, "")}/functions/v1/whatsapp-green-webhook`;

export const WHATSAPP_WEBHOOK_DEPLOY_WORKFLOW_URL =
  "https://github.com/erezbabayan/BabiTk/actions/workflows/deploy-supabase-functions.yml";

export const SUPABASE_ACCESS_TOKEN_URL = "https://supabase.com/dashboard/account/tokens";

export const GITHUB_ACTIONS_SECRETS_URL =
  "https://github.com/erezbabayan/BabiTk/settings/secrets/actions";

/** Live Edge Function must advertise this after the group-LID capture fix. */
export const LIVE_CAPTURE_VERSION = "group-lid-v1";

export function webhookReportsLiveCapture(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return (body as { capture?: unknown }).capture === LIVE_CAPTURE_VERSION;
}

export async function liveWhatsAppQuestionsReady(): Promise<boolean> {
  if (!WEBHOOK_URL.startsWith("https://")) return false;
  try {
    const response = await fetch(WEBHOOK_URL, { method: "GET" });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return webhookReportsLiveCapture(body);
  } catch {
    return false;
  }
}
