import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import {
  buildGoogleAuthUrl,
  disconnectGoogleCalendar,
  exchangeGoogleCode,
} from "../services/calendar.service.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { calendarCallbackHtml, withCalendarQuery, DEFAULT_WEB_APP_URL } from "../lib/google-calendar.js";
import { env } from "../config/env.js";

export const integrationsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/google/connect", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    try {
      const url = await buildGoogleAuthUrl(request.user.id);
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
    const webAppUrl = env.webAppUrl || DEFAULT_WEB_APP_URL;

    if (query.error || !query.code || !query.state) {
      return reply
        .status(400)
        .type("text/html")
        .send(
          calendarCallbackHtml({
            ok: false,
            webAppUrl: withCalendarQuery(webAppUrl, "error"),
            message: "החיבור ליומן בוטל או נכשל. אפשר לנסות שוב מההגדרות.",
          }),
        );
    }

    try {
      await exchangeGoogleCode(query.state, query.code);
      return reply.type("text/html").send(
        calendarCallbackHtml({
          ok: true,
          webAppUrl: withCalendarQuery(webAppUrl, "connected"),
          message: "אפשר לסגור את החלון. משימות עם תאריך יופיעו עכשיו ביומן Google.",
        }),
      );
    } catch (error) {
      return reply.status(400).type("text/html").send(
        calendarCallbackHtml({
          ok: false,
          webAppUrl: withCalendarQuery(webAppUrl, "error"),
          message: error instanceof Error ? error.message : "OAuth failed",
        }),
      );
    }
  });

  app.get("/google/status", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("users")
      .select("google_calendar_enabled, google_refresh_token")
      .eq("id", request.user.id)
      .single();

    const linked =
      Boolean(data?.google_calendar_enabled) &&
      typeof data?.google_refresh_token === "string" &&
      data.google_refresh_token.length > 8;
    return reply.send({ linked });
  });

  app.post("/google/disconnect", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    await disconnectGoogleCalendar(request.user.id);
    return reply.send({ ok: true, linked: false });
  });
};
