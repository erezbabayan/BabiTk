import { env } from "../../config/env.js";
import type {
  WhatsAppProviderId,
  WhatsAppProviderStatus,
} from "../../types/whatsapp.js";

const PROVIDER_LABELS: Record<WhatsAppProviderId, string> = {
  meta: "Meta Cloud API",
  "green-api": "Green-API",
  whapi: "Whapi.Cloud",
};

const PROVIDER_HINTS: Record<WhatsAppProviderId, string> = {
  meta: "Meta Developer Console → Webhook: /api/whatsapp/webhook",
  "green-api":
    "Green-API Console → Webhook URL: https://YOUR_DOMAIN/api/whatsapp/webhook/inbound",
  whapi:
    "Whapi Dashboard → Webhook URL: https://YOUR_DOMAIN/api/whatsapp/webhook/inbound",
};

function isRealMetaConfigured(): boolean {
  const token = env.whatsappAccessToken?.trim() ?? "";
  const phoneId = env.whatsappPhoneNumberId?.trim() ?? "";
  if (!token || !phoneId) return false;
  // Reject placeholders like EAA... / 1234567890 / your-* so UI stops lying.
  if (token.length < 20) return false;
  if (phoneId === "1234567890") return false;
  if (/^your[-_]/i.test(token) || /^your[-_]/i.test(phoneId)) return false;
  return true;
}

export function isWhatsAppProviderConfigured(
  provider: WhatsAppProviderId = env.whatsappProvider,
): boolean {
  switch (provider) {
    case "green-api":
      return Boolean(env.greenApiInstanceId && env.greenApiToken);
    case "whapi":
      return Boolean(env.whapiApiToken && env.whapiApiToken.length >= 16);
    case "meta":
    default:
      return isRealMetaConfigured();
  }
}

export function getWhatsAppProviderStatus(): WhatsAppProviderStatus {
  const provider = env.whatsappProvider;
  return {
    provider,
    configured: isWhatsAppProviderConfigured(provider),
    inboundWebhookPath: "/api/whatsapp/webhook/inbound",
    metaWebhookPath: provider === "meta" ? "/api/whatsapp/webhook" : undefined,
    label: PROVIDER_LABELS[provider],
    setupHint: PROVIDER_HINTS[provider],
  };
}

export function verifyAlternateWebhookAuth(
  headers: Record<string, string | string[] | undefined>,
  query: Record<string, string | undefined>,
): boolean {
  const expected =
    env.whatsappInboundWebhookToken ??
    (env.whatsappProvider === "green-api"
      ? env.greenApiWebhookToken
      : env.whapiWebhookToken);

  if (!expected) {
    return true;
  }

  const authHeader = headers.authorization;
  const bearer =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : undefined;

  const tokenHeader = headers["x-webhook-token"];
  const headerToken = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;

  return (
    bearer === expected ||
    headerToken === expected ||
    query.token === expected
  );
}
