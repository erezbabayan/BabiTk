import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { SYNC_USER_ID } from "../services/sync-store.service.js";

export async function requireSyncAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!env.demoSyncEnabled) {
    reply.status(404).send({ error: "not_found", message: "Sync API disabled" });
    return;
  }

  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reply.status(401).send({ error: "unauthorized", message: "Missing Bearer token" });
    return;
  }

  const token = header.slice("Bearer ".length);
  if (token !== env.demoSyncToken) {
    reply.status(401).send({ error: "unauthorized", message: "Invalid sync token" });
    return;
  }

  request.user = { id: SYNC_USER_ID, email: "demo@mindtasker.local" };
}
