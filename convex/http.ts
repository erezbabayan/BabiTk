import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import {
  parseGreenApiWebhook,
  verifyGreenApiWebhookAuth,
} from "./lib/greenApiParser";
import { UNLINKED_PHONE_MESSAGE } from "./lib/messages";

const http = httpRouter();

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

const INGESTIBLE_TYPES = new Set(["text", "audio", "image"]);

/**
 * Green-API inbound webhook — Step B.
 *
 * Configure in Green-API Console:
 *   POST https://YOUR_DEPLOYMENT.convex.site/webhook/green-api
 *   Authorization: Bearer <GREEN_API_WEBHOOK_TOKEN>
 *
 * Flow:
 *   1. Verify token + parse JSON
 *   2. Detect media type (text / audio / image)
 *   3. Extract sender_id from senderData.chatId
 *   4. Match phone → users (phoneVerified=true)
 *   5. Schedule ingest pipeline for linked users
 */
http.route({
  path: "/webhook/green-api",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expectedToken = process.env.GREEN_API_WEBHOOK_TOKEN;

    if (!verifyGreenApiWebhookAuth(request, expectedToken)) {
      return jsonResponse({ error: "invalid_webhook_token" }, 401);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400);
    }

    const parsed = parseGreenApiWebhook(body);

    if (parsed.ignored) {
      return jsonResponse({
        received: true,
        ignored: true,
        reason: parsed.reason ?? "not_inbound",
      });
    }

    if (parsed.messages.length === 0) {
      return jsonResponse({
        received: true,
        messages: [],
        note: parsed.reason ?? "no_actionable_content",
      });
    }

    const resolutions = [];
    const scheduled: Array<{
      messageId: string;
      mediaType: string;
      userId: string;
    }> = [];

    for (const message of parsed.messages) {
      const resolution = await ctx.runMutation(
        internal.whatsappWebhook.resolveGreenApiSender,
        {
          messageId: message.messageId,
          senderId: message.senderId,
          senderPhone: message.senderPhone,
          messageType: message.type,
        },
      );
      resolutions.push(resolution);

      if (!resolution.resolved && message.senderPhone) {
        await ctx.scheduler.runAfter(0, internal.whatsappSend.sendReply, {
          toPhone: message.senderPhone,
          message: UNLINKED_PHONE_MESSAGE,
        });
      }

      if (
        resolution.resolved &&
        resolution.userId &&
        INGESTIBLE_TYPES.has(message.type)
      ) {
        await ctx.scheduler.runAfter(0, internal.inboundPipeline.processGreenApiMessage, {
          userId: resolution.userId,
          messageId: message.messageId,
          senderPhone: message.senderPhone,
          messageType: message.type,
          text: message.text,
          audioUrl: message.audioUrl,
          imageUrl: message.imageUrl,
          mimeType: message.mimeType,
        });
        scheduled.push({
          messageId: message.messageId,
          mediaType: message.type,
          userId: resolution.userId,
        });
      }
    }

    return jsonResponse({
      received: true,
      provider: "green-api",
      count: resolutions.length,
      scheduled,
      resolutions,
    });
  }),
});

/** Health check for webhook URL verification. */
http.route({
  path: "/webhook/green-api",
  method: "GET",
  handler: httpAction(async () => {
    return jsonResponse({
      ok: true,
      provider: "green-api",
      endpoint: "/webhook/green-api",
      method: "POST",
      supportedMedia: ["text", "audio", "image"],
    });
  }),
});

export default http;
