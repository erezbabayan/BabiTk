import { httpRouter } from "convex/server";

import { auth } from "./auth";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import {
  parseGreenApiWebhook,
  verifyGreenApiWebhookAuth,
} from "./lib/greenApiParser";
const http = httpRouter();

auth.addHttpRoutes(http);

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
 *   5. Gate: only the user's capture WhatsApp group
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
    const skipped: Array<{
      messageId: string;
      reason: string;
      chatId?: string;
    }> = [];

    for (const message of parsed.messages) {
      const bodyObj = body as {
        instanceData?: { wid?: string };
        senderData?: { sender?: string; chatId?: string };
      };
      const fallbackPhones = [
        bodyObj.instanceData?.wid,
        bodyObj.senderData?.sender,
        // Prefer instance wid for phone match; skip @lid / group chatIds as phones.
        message.senderPhone,
      ].filter((p): p is string => {
        const t = p?.trim() ?? "";
        if (!t) return false;
        if (t.toLowerCase().endsWith("@lid")) return false;
        if (t.toLowerCase().endsWith("@g.us")) return false;
        return true;
      });

      // Prefer instance-linked phone for Message Yourself (outgoing self-chat).
      const resolution = await ctx.runMutation(
        internal.whatsappWebhook.resolveGreenApiSender,
        {
          messageId: message.messageId,
          senderId: message.senderId,
          senderPhone: message.senderPhone,
          messageType: message.type,
          fallbackPhones: [
            bodyObj.instanceData?.wid,
            ...fallbackPhones,
          ].filter((p): p is string => Boolean(p?.trim())),
        },
      );
      resolutions.push(resolution);

      // Never auto-reply to unlinked / unknown senders — that sent "מספר לא מקושר"
      // from the owner's WhatsApp to random contacts. Silently ignore instead.
      if (!resolution.resolved) {
        skipped.push({
          messageId: message.messageId,
          reason: resolution.reason ?? "not_linked",
          chatId: message.chatId,
        });
        continue;
      }

      const captureGate = await ctx.runMutation(
        internal.whatsappWebhook.gateCaptureMessage,
        {
          userId: resolution.userId!,
          chatId: message.chatId,
          chatName: message.chatName,
        },
      );
      if (!captureGate.allowed) {
        skipped.push({
          messageId: message.messageId,
          reason: captureGate.reason ?? "capture_gated",
          chatId: message.chatId,
        });
        continue;
      }

      if (
        resolution.resolved &&
        resolution.userId &&
        INGESTIBLE_TYPES.has(message.type)
      ) {
        await ctx.scheduler.runAfter(0, internal.inboundPipeline.processGreenApiMessage, {
          userId: resolution.userId,
          messageId: message.messageId,
          senderPhone: resolution.senderPhone || message.senderPhone,
          chatId: message.chatId,
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
      skipped,
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
