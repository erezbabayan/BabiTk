import type { FastifyPluginAsync } from "fastify";
import { requireCronSecret } from "../middleware/cron-auth.js";
import {
  archiveStaleInboxItems,
  sendDailyDigests,
} from "../services/cron.service.js";

/**
 * HTTP cron endpoints — alternative to in-process node-cron.
 * Call from Supabase Edge Functions, GitHub Actions, or external schedulers.
 *
 * Authorization: Bearer <CRON_SECRET>
 */
export const cronRoutes: FastifyPluginAsync = async (app) => {
  app.post("/archive-inbox", async (request, reply) => {
    if (!requireCronSecret(request, reply)) return;

    try {
      const count = await archiveStaleInboxItems();
      return reply.send({ ok: true, archived: count });
    } catch (error) {
      request.log.error({ err: error }, "HTTP cron archive failed");
      return reply.status(500).send({
        error: "archive_failed",
        message: error instanceof Error ? error.message : "Archive failed",
      });
    }
  });

  app.post("/daily-digest", async (request, reply) => {
    if (!requireCronSecret(request, reply)) return;

    try {
      const sent = await sendDailyDigests();
      return reply.send({ ok: true, digests_sent: sent });
    } catch (error) {
      request.log.error({ err: error }, "HTTP cron digest failed");
      return reply.status(500).send({
        error: "digest_failed",
        message: error instanceof Error ? error.message : "Digest failed",
      });
    }
  });
};
