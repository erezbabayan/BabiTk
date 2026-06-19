import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { getHealthStatus } from "./lib/health.js";
import { aiRoutes } from "./routes/ai.routes.js";
import { ingestRoutes } from "./routes/ingest.routes.js";
import { integrationsRoutes } from "./routes/integrations.routes.js";
import { usageRoutes } from "./routes/usage.routes.js";
import { itemsRoutes } from "./routes/items.routes.js";
import { boardSettingsRoutes } from "./routes/board-settings.routes.js";
import { billingRoutes } from "./routes/billing.routes.js";
import { cronRoutes } from "./routes/cron.routes.js";
import { profileRoutes } from "./routes/profile.routes.js";
import { tagsRoutes } from "./routes/tags.routes.js";
import { syncRoutes } from "./routes/sync.routes.js";
import { whatsappRoutes } from "./routes/whatsapp.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: env.corsOrigins?.length
      ? env.corsOrigins
      : env.isDevelopment,
    credentials: true,
  });

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
    allowList: (request) => {
      const url = request.url?.split("?")[0] ?? "";
      return url === "/health" || url.endsWith("/api/sync/items");
    },
  });

  app.get("/health", async () => getHealthStatus());

  await app.register(aiRoutes, { prefix: "/api/ai" });
  await app.register(ingestRoutes, { prefix: "/api/ingest" });
  await app.register(itemsRoutes, { prefix: "/api/items" });
  await app.register(profileRoutes, { prefix: "/api/profile" });
  await app.register(boardSettingsRoutes, { prefix: "/api/board-settings" });
  await app.register(tagsRoutes, { prefix: "/api/tags" });
  await app.register(integrationsRoutes, { prefix: "/api/integrations" });
  await app.register(usageRoutes, { prefix: "/api/usage" });
  await app.register(billingRoutes, { prefix: "/api/billing" });
  await app.register(cronRoutes, { prefix: "/api/cron" });
  await app.register(syncRoutes, { prefix: "/api/sync" });
  await app.register(whatsappRoutes, { prefix: "/api/whatsapp" });

  return app;
}
