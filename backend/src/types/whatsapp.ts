export type WhatsAppProviderId = "meta" | "green-api" | "whapi";

export interface WhatsAppInboundMessage {
  id: string;
  /** E.164-ish phone, e.g. +972501234567 */
  from: string;
  /** Full chat id (group @g.us or personal @c.us) when known */
  chatId?: string;
  type: string;
  text?: string;
  /** True when the inbound message was forwarded into the chat. */
  forwarded?: boolean;
  /** Interactive / button reply payload (Meta buttons, Green-API replies). */
  buttonReply?: string;
  /** Meta Cloud API media id */
  audioId?: string;
  imageId?: string;
  /** Direct download URL (Green-API, Whapi, generic providers) */
  audioUrl?: string;
  imageUrl?: string;
  mimeType?: string;
  provider?: WhatsAppProviderId;
}

export interface WhatsAppWebhookPayload {
  messages: WhatsAppInboundMessage[];
}

export interface WhatsAppProviderStatus {
  provider: WhatsAppProviderId;
  configured: boolean;
  inboundWebhookPath: string;
  metaWebhookPath?: string;
  label: string;
  setupHint: string;
}
