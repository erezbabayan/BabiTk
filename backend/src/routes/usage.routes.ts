import type { FastifyPluginAsync } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import { getUsageSummary } from "../services/usage.service.js";

export const usageRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  app.get("/summary", async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    const summary = await getUsageSummary(request.user.id);
    return reply.send(summary);
  });
};
