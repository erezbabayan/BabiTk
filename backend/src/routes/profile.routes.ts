import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { publicErrorMessage } from "../lib/public-error.js";
import {
  getUserProfile,
  requestPhoneVerification,
  verifyPhoneCode,
} from "../services/phone.service.js";

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    try {
      const profile = await getUserProfile(request.user.id);
      return reply.send({ profile });
    } catch (error) {
      request.log.error({ err: error }, "profile_failed");
      return reply.status(400).send({
        error: "profile_failed",
        message: publicErrorMessage(error, "טעינת הפרופיל נכשלה"),
      });
    }
  });

  app.post(
    "/phone/request",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
    const body = z.object({ phone: z.string().trim().min(9) }).safeParse(request.body);
    if (!body.success || !request.user) {
      return reply.status(400).send({ error: "validation_error" });
    }

    try {
      const result = await requestPhoneVerification(request.user.id, body.data.phone);
      return reply.send(result);
    } catch (error) {
      request.log.warn({ err: error }, "phone_request_failed");
      return reply.status(400).send({
        error: "phone_request_failed",
        message: publicErrorMessage(error, "שליחת קוד האימות נכשלה"),
      });
    }
  });

  app.post(
    "/phone/verify",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
    const body = z.object({ code: z.string().trim().min(4).max(8) }).safeParse(request.body);
    if (!body.success || !request.user) {
      return reply.status(400).send({ error: "validation_error" });
    }

    try {
      const profile = await verifyPhoneCode(request.user.id, body.data.code);
      return reply.send({ profile, message: "הטלפון אומת וקושר בהצלחה" });
    } catch (error) {
      request.log.warn({ err: error }, "phone_verify_failed");
      return reply.status(400).send({
        error: "phone_verify_failed",
        message: publicErrorMessage(error, "אימות הטלפון נכשל"),
      });
    }
  });
};
