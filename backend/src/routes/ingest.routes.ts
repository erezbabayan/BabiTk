import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { handlePaywallError } from "../middleware/usage.js";
import { ingestText } from "../services/ingest.service.js";
import { integrateNluTaskForUser } from "../services/nlu-task.service.js";

const ingestTextSchema = z.object({
  text: z.string().trim().min(3),
  timezone: z.string().optional(),
  locale: z.string().optional(),
});

const nluTaskBodySchema = z.object({
  task: z.string().trim().min(1),
  context: z.array(z.string().trim().min(1)).default([]),
  reminder_datetime: z.string().trim().optional(),
  original_transcription: z.string().trim().min(1),
  timezone: z.string().optional(),
  storage_url: z.string().nullable().optional(),
});

export const ingestRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.post("/text", async (request, reply) => {
    const body = ingestTextSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: "validation_error",
        message: body.error.flatten(),
      });
    }

    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    try {
      const result = await ingestText({
        userId: request.user.id,
        text: body.data.text,
        sourceType: "typed_text",
        metadata: { channel: "api" },
        timezone: body.data.timezone,
        locale: body.data.locale,
      });

      return reply.send(result);
    } catch (error) {
      if (handlePaywallError(error, reply)) return;
      request.log.error({ err: error }, "ingestText failed");
      return reply.status(502).send({
        error: "ingest_failed",
        message: error instanceof Error ? error.message : "Ingest failed",
      });
    }
  });

  app.post("/nlu-task", async (request, reply) => {
    const body = nluTaskBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        code: "validation_error",
        message: body.error.flatten(),
      });
    }

    if (!request.user) {
      return reply.status(401).send({ success: false, code: "unauthorized", message: "Unauthorized" });
    }

    const result = await integrateNluTaskForUser(request.user.id, {
      task: body.data.task,
      context: body.data.context,
      reminder_datetime: body.data.reminder_datetime,
      original_transcription: body.data.original_transcription,
    }, {
      sourceType: "whatsapp_voice",
      storageUrl: body.data.storage_url ?? null,
      timezone: body.data.timezone,
      metadata: { channel: "api" },
    });

    if (!result.success) {
      const status =
        result.code === "validation_error" || result.code === "invalid_date"
          ? 400
          : result.code === "user_not_found" || result.code === "user_inactive"
            ? 404
            : 502;
      return reply.status(status).send(result);
    }

    return reply.send(result);
  });
};
