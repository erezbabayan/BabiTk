import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
} from "../services/calendar.service.js";
import { getSupabaseAdmin } from "../lib/supabase.js";

export const integrationsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/google/connect", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    try {
      const url = buildGoogleAuthUrl(request.user.id);
      return reply.send({ url });
    } catch (error) {
      return reply.status(503).send({
        error: "google_not_configured",
        message: error instanceof Error ? error.message : "Google Calendar unavailable",
      });
    }
  });

  app.get("/google/callback", async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };

    if (query.error || !query.code || !query.state) {
      return reply.status(400).send({ error: "oauth_failed" });
    }

    try {
      await exchangeGoogleCode(query.state, query.code);
      return reply.type("text/html").send(
        "<html><body style='font-family:sans-serif;text-align:center;padding:40px'>" +
          "<h2>Google Calendar מחובר בהצלחה!</h2>" +
          "<p>אפשר לסגור את החלון ולחזור ל-MindTasker.</p></body></html>",
      );
    } catch (error) {
      return reply.status(400).send({
        error: "token_exchange_failed",
        message: error instanceof Error ? error.message : "OAuth failed",
      });
    }
  });

  app.get("/google/status", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("users")
      .select("google_calendar_enabled")
      .eq("id", request.user.id)
      .single();

    return reply.send({ linked: Boolean(data?.google_calendar_enabled) });
  });
};
