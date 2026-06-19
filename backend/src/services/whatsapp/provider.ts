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

export function isWhatsAppProviderConfigured(
  provider: WhatsAppProviderId = env.whatsappProvider,
): boolean {
  switch (provider) {
    case "green-api":
      return Boolean(env.greenApiInstanceId && env.greenApiToken);
    case "whapi":
      return Boolean(env.whapiApiToken);
    case "meta":
    default:
      return Boolean(env.whatsappAccessToken && env.whatsappPhoneNumberId);
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
