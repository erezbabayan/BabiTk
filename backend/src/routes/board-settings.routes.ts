import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import {
  getBoardSettings,
  updateBoardSettings,
} from "../services/board-settings.service.js";

const patchSchema = z.object({
  inbox_archive_hours: z.union([
    z.literal(48),
    z.literal(72),
    z.literal(168),
    z.literal(720),
  ]),
});

export const boardSettingsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    try {
      const settings = await getBoardSettings(request.user.id);
      return reply.send({ settings });
    } catch (error) {
      return reply.status(400).send({
        error: "board_settings_failed",
        message: error instanceof Error ? error.message : "Failed to load board settings",
      });
    }
  });

  app.patch("/", async (request, reply) => {
    const body = patchSchema.safeParse(request.body);
    if (!body.success || !request.user) {
      return reply.status(400).send({ error: "validation_error" });
    }

    try {
      const settings = await updateBoardSettings(request.user.id, body.data);
      return reply.send({ settings });
    } catch (error) {
      return reply.status(400).send({
        error: "board_settings_update_failed",
        message: error instanceof Error ? error.message : "Update failed",
      });
    }
  });
};
