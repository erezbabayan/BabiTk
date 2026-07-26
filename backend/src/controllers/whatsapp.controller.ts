import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { sanitizeWhatsAppMessage } from "../middleware/whatsapp-sanitize.js";
import { safeProcessWhatsAppMessage } from "../services/whatsapp-ingest.service.js";
import {
  getWhatsAppProviderStatus,
  verifyAlternateWebhookAuth,
} from "../services/whatsapp/provider.js";
import { parseInboundWebhook } from "../services/whatsapp/parsers.js";
import { sendWhatsAppText } from "../services/whatsapp/send.js";
import { parseMetaWebhook } from "../services/whatsapp/parsers.js";
import { verifyWhatsAppSignature } from "../utils/whatsapp.js";

/**
 * WhatsApp webhook controller — Meta Cloud API + Green-API + Whapi.
 *
 * End-to-end flow (every inbound message):
 *
 *   POST webhook
 *        → parse JSON → message.from (sender phone)
 *        → processWhatsAppMessage()
 *             → DB: user with this phone + phone_verified?
 *             → yes: text/audio/image → Inbox (items table)
 *             → no:  ignore (no outbound reply to strangers)
 *
 * Routes:
 *   POST /api/whatsapp/webhook          → Meta (signature verified)
 *   POST /api/whatsapp/webhook/inbound  → Green-API / Whapi / generic JSON
 *   GET  /api/whatsapp/status           → provider info for Web + Mobile UI
 */

interface WhatsAppWebhookQuery {
  "hub.mode"?: string;
  "hub.verify_token"?: string;
  "hub.challenge"?: string;
  token?: string;
}

interface RequestWithRawBody extends FastifyRequest {
  rawBody?: Buffer;
}

export async function getWhatsAppStatus(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await reply.send(getWhatsAppProviderStatus());
}

/** Meta webhook subscription verification (GET /webhook). */
export async function verifyWhatsAppWebhook(
  request: FastifyRequest<{ Querystring: WhatsAppWebhookQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query;

  if (
    query["hub.mode"] === "subscribe" &&
    query["hub.verify_token"] === env.whatsappVerifyToken &&
    query["hub.challenge"]
  ) {
    await reply.status(200).send(query["hub.challenge"]);
    return;
  }

  await reply.status(403).send({ error: "verification_failed" });
}

/** Meta Cloud API inbound messages (POST /webhook). */
export async function handleWhatsAppWebhook(
  request: RequestWithRawBody,
  reply: FastifyReply,
): Promise<void> {
  const signatureHeader = request.headers["x-hub-signature-256"];
  const signature = Array.isArray(signatureHeader)
    ? signatureHeader[0]
    : signatureHeader;
  const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body));

  if (!verifyWhatsAppSignature(rawBody, signature)) {
    await reply.status(401).send({ error: "invalid_signature" });
    return;
  }

  const { messages } = parseMetaWebhook(request.body);
  await queueInboundMessages(messages, request.log);
  await reply.status(200).send({ received: true });
}

/** Green-API / Whapi / generic providers (POST /webhook/inbound). */
export async function handleAlternateWhatsAppWebhook(
  request: FastifyRequest<{ Querystring: WhatsAppWebhookQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const query = request.query as Record<string, string | undefined>;

  if (
    !verifyAlternateWebhookAuth(
      request.headers as Record<string, string | string[] | undefined>,
      query,
    )
  ) {
    await reply.status(401).send({ error: "invalid_webhook_token" });
    return;
  }

  const { messages } = parseInboundWebhook(request.body);
  await queueInboundMessages(messages, request.log);
  await reply.status(200).send({ received: true });
}

async function queueInboundMessages(
  messages: Awaited<ReturnType<typeof parseInboundWebhook>>["messages"],
  log: FastifyBaseLogger,
): Promise<void> {
  for (const message of messages) {
    void dispatchIncomingMessage(message, log).catch((error) => {
      log.error(
        { err: error, messageId: message.id },
        "Unhandled WhatsApp dispatch error",
      );
    });
  }
}

export async function dispatchIncomingMessage(
  message: import("../types/whatsapp.js").WhatsAppInboundMessage,
  log: FastifyBaseLogger,
): Promise<void> {
  const sanitize = sanitizeWhatsAppMessage(message);

  if (!sanitize.accepted) {
    log.info(
      { messageId: message.id, type: message.type, reason: sanitize.reason },
      "WhatsApp message filtered as junk",
    );
    // Never auto-reply to filtered messages — especially from unknown contacts.
    return;
  }

  try {
    await safeProcessWhatsAppMessage(message);
  } catch (error) {
    log.error({ err: error, messageId: message.id }, "WhatsApp ingest failed");
    // Only notify linked accounts; do not message strangers from the bot line.
    const { findInboxUserByPhone } = await import("../services/items.service.js");
    const linked = await findInboxUserByPhone(message.from).catch(() => null);
    if (!linked) return;
    await sendWhatsAppText(
      message.from,
      "אירעה שגיאה בעיבוד ההודעה. נסה שוב בעוד רגע.",
    ).catch((sendError) => {
      log.error({ err: sendError }, "Failed to send WhatsApp error message");
    });
  }
}
