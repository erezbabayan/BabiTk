import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import {
  approveItem,
  completeItem,
  getItemById,
  restoreFromArchive,
  snoozeItem,
  toggleItemType,
} from "../services/items.service.js";
import { handlePaywallError } from "../middleware/usage.js";
import { assertAiParseQuota } from "../services/usage.service.js";
import { searchItems } from "../services/search.service.js";

const searchBodySchema = z.object({
  query: z.string().trim().min(2),
  match_count: z.number().int().min(1).max(20).optional(),
  match_threshold: z.number().min(0).max(1).optional(),
  scope: z.enum(["all", "inbox", "today", "notes"]).optional(),
});

const toggleBodySchema = z.object({
  due_date: z.string().datetime({ offset: true }).nullable().optional(),
});

const snoozeBodySchema = z.object({
  due_date: z.string().datetime({ offset: true }),
});

export const itemsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.post("/search", async (request, reply) => {
    const body = searchBodySchema.safeParse(request.body);
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
      await assertAiParseQuota(request.user.id, 1);
      const results = await searchItems(request.user.id, body.data.query, {
        matchCount: body.data.match_count,
        matchThreshold: body.data.match_threshold,
        scope: body.data.scope,
      });
      return reply.send({ results });
    } catch (error) {
      if (handlePaywallError(error, reply)) return;
      request.log.error({ err: error }, "searchNotes failed");
      return reply.status(502).send({
        error: "search_failed",
        message: error instanceof Error ? error.message : "Search failed",
      });
    }
  });

  app.patch("/:id/approve", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success || !request.user) {
      return reply.status(400).send({ error: "validation_error" });
    }

    try {
      const item = await approveItem(request.user.id, params.data.id);
      return reply.send({ item });
    } catch (error) {
      request.log.error({ err: error }, "approveItem failed");
      return reply.status(400).send({
        error: "approve_failed",
        message: error instanceof Error ? error.message : "Approve failed",
      });
    }
  });

  app.patch("/:id/toggle-type", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = toggleBodySchema.safeParse(request.body ?? {});

    if (!params.success || !body.success) {
      return reply.status(400).send({ error: "validation_error" });
    }

    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    try {
      const updated = await toggleItemType(
        request.user.id,
        params.data.id,
        { due_date: body.data.due_date },
      );

      const item = await getItemById(updated.id, request.user.id);
      return reply.send({ item });
    } catch (error) {
      request.log.error({ err: error }, "toggleItemType failed");
      return reply.status(400).send({
        error: "toggle_failed",
        message: error instanceof Error ? error.message : "Toggle failed",
      });
    }
  });

  app.patch("/:id/complete", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success || !request.user) {
      return reply.status(400).send({ error: "validation_error" });
    }

    try {
      const item = await completeItem(request.user.id, params.data.id);
      return reply.send({ item });
    } catch (error) {
      return reply.status(400).send({
        error: "complete_failed",
        message: error instanceof Error ? error.message : "Complete failed",
      });
    }
  });

  app.patch("/:id/snooze", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = snoozeBodySchema.safeParse(request.body);
    if (!params.success || !body.success || !request.user) {
      return reply.status(400).send({ error: "validation_error" });
    }

    try {
      const item = await snoozeItem(request.user.id, params.data.id, body.data.due_date);
      return reply.send({ item });
    } catch (error) {
      return reply.status(400).send({
        error: "snooze_failed",
        message: error instanceof Error ? error.message : "Snooze failed",
      });
    }
  });

  app.patch("/:id/restore-archive", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success || !request.user) {
      return reply.status(400).send({ error: "validation_error" });
    }

    try {
      const item = await restoreFromArchive(request.user.id, params.data.id);
      return reply.send({ item });
    } catch (error) {
      return reply.status(400).send({
        error: "restore_failed",
        message: error instanceof Error ? error.message : "Restore failed",
      });
    }
  });
};
