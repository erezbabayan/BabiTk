import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import {
  createBillingPortalSession,
  createCheckoutSession,
  handleStripeWebhook,
  isStripeConfigured,
} from "../services/stripe.service.js";

interface RequestWithRawBody extends FastifyRequest {
  rawBody?: Buffer;
}

export const billingRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preParsing", async (request, _reply, payload) => {
    if (!request.url.includes("/webhook")) {
      return payload;
    }

    const chunks: Buffer[] = [];
    const stream = payload as AsyncIterable<Buffer | string>;
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks);
    (request as RequestWithRawBody).rawBody = raw;
    return raw;
  });

  app.post("/webhook", async (request, reply) => {
    if (!isStripeConfigured()) {
      return reply.status(503).send({ error: "stripe_not_configured" });
    }

    try {
      const rawBody = (request as RequestWithRawBody).rawBody;
      if (!rawBody) {
        return reply.status(400).send({ error: "missing_body" });
      }

      const signature = request.headers["stripe-signature"];
      await handleStripeWebhook(
        rawBody,
        typeof signature === "string" ? signature : signature?.[0],
      );

      return reply.send({ received: true });
    } catch (error) {
      request.log.error({ err: error }, "Stripe webhook failed");
      return reply.status(400).send({
        error: "webhook_failed",
        message: error instanceof Error ? error.message : "Webhook failed",
      });
    }
  });

  app.post("/checkout", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    if (!isStripeConfigured()) {
      return reply.status(503).send({
        error: "stripe_not_configured",
        message: "תשלומים אינם מוגדרים בשרת",
      });
    }

    const body = z
      .object({ platform: z.enum(["web", "mobile"]).optional() })
      .safeParse(request.body ?? {});

    try {
      const platform = body.success ? (body.data.platform ?? "web") : "web";
      const url = await createCheckoutSession(request.user.id, platform);
      return reply.send({ url });
    } catch (error) {
      request.log.error({ err: error }, "Stripe checkout failed");
      return reply.status(502).send({
        error: "checkout_failed",
        message: error instanceof Error ? error.message : "Checkout failed",
      });
    }
  });

  app.post("/portal", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    if (!isStripeConfigured()) {
      return reply.status(503).send({
        error: "stripe_not_configured",
        message: "תשלומים אינם מוגדרים בשרת",
      });
    }

    try {
      const url = await createBillingPortalSession(request.user.id);
      return reply.send({ url });
    } catch (error) {
      return reply.status(400).send({
        error: "portal_failed",
        message: error instanceof Error ? error.message : "Portal failed",
      });
    }
  });
};
