import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { listUserTags, replaceUserTags } from "../services/user-tags.service.js";

const tagInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().trim().min(4).max(20),
});

const replaceBodySchema = z.object({
  tags: z.array(tagInputSchema).min(1).max(12),
});

export const tagsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    try {
      const tags = await listUserTags(request.user.id);
      return reply.send({ tags });
    } catch (error) {
      request.log.error({ err: error }, "listUserTags failed");
      return reply.status(500).send({
        error: "tags_list_failed",
        message: error instanceof Error ? error.message : "Failed to load tags",
      });
    }
  });

  app.put("/", async (request, reply) => {
    const body = replaceBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: "validation_error",
        message: "נתוני תגיות לא תקינים",
      });
    }

    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    try {
      const tags = await replaceUserTags(request.user.id, body.data.tags);
      return reply.send({ tags });
    } catch (error) {
      request.log.error({ err: error }, "replaceUserTags failed");
      return reply.status(400).send({
        error: "tags_save_failed",
        message: error instanceof Error ? error.message : "Failed to save tags",
      });
    }
  });
};
