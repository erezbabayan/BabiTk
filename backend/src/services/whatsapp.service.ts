import { parseMetaWebhook } from "./whatsapp/parsers.js";

export { sendWhatsAppText } from "./whatsapp/send.js";
export {
  downloadInboundMedia,
  downloadWhatsAppMedia,
} from "./whatsapp/media.js";
export {
  detectWebhookProvider,
  parseGenericWebhook,
  parseGreenApiWebhook,
  parseInboundWebhook,
  parseMetaWebhook,
  parseWhapiWebhook,
} from "./whatsapp/parsers.js";
export {
  getWhatsAppProviderStatus,
  isWhatsAppProviderConfigured,
  verifyAlternateWebhookAuth,
} from "./whatsapp/provider.js";

export type {
  WhatsAppInboundMessage,
  WhatsAppWebhookPayload,
} from "../types/whatsapp.js";

/** @deprecated Use parseMetaWebhook or parseInboundWebhook */
export function parseWhatsAppWebhook(body: unknown) {
  return parseMetaWebhook(body);
}
