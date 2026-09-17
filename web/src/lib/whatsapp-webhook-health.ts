const WEBHOOK_URL = `${(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "")}/functions/v1/whatsapp-green-webhook`;

export const WHATSAPP_WEBHOOK_DEPLOY_WORKFLOW_URL =
  "https://github.com/erezbabayan/BabiTk/actions/workflows/deploy-supabase-functions.yml";

export const SUPABASE_ACCESS_TOKEN_URL = "https://supabase.com/dashboard/account/tokens";

export const GITHUB_ACTIONS_SECRETS_URL =
  "https://github.com/erezbabayan/BabiTk/settings/secrets/actions";

export async function liveWhatsAppQuestionsReady(): Promise<boolean> {
  if (!WEBHOOK_URL.startsWith("https://")) return false;
  try {
    const response = await fetch(WEBHOOK_URL, { method: "GET" });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return (
      typeof body === "object" &&
      body !== null &&
      "qa" in body &&
      ((body as { qa?: unknown }).qa === "babi-v2" ||
        (body as { qa?: unknown }).qa === "babi-v1" ||
        (body as { qa?: unknown }).qa === "voice-v1" ||
        (body as { qa?: unknown }).qa === "star-v1")
    );
  } catch {
    return false;
  }
}
