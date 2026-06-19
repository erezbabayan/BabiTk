import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
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
      return reply.status(400).send({
        error: "profile_failed",
        message: error instanceof Error ? error.message : "Failed to load profile",
      });
    }
  });

  app.post("/phone/request", async (request, reply) => {
    const body = z.object({ phone: z.string().trim().min(9) }).safeParse(request.body);
    if (!body.success || !request.user) {
      return reply.status(400).send({ error: "validation_error" });
    }

    try {
      const result = await requestPhoneVerification(request.user.id, body.data.phone);
      return reply.send(result);
    } catch (error) {
      return reply.status(400).send({
        error: "phone_request_failed",
        message: error instanceof Error ? error.message : "Request failed",
      });
    }
  });

  app.post("/phone/verify", async (request, reply) => {
    const body = z.object({ code: z.string().trim().min(4).max(8) }).safeParse(request.body);
    if (!body.success || !request.user) {
      return reply.status(400).send({ error: "validation_error" });
    }

    try {
      const profile = await verifyPhoneCode(request.user.id, body.data.code);
      return reply.send({ profile, message: "הטלפון אומת וקושר בהצלחה" });
    } catch (error) {
      return reply.status(400).send({
        error: "phone_verify_failed",
        message: error instanceof Error ? error.message : "Verification failed",
      });
    }
  });
};
