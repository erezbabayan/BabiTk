import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { secretEquals } from "../lib/secret-equals.js";

export function requireCronSecret(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  if (!env.cronSecret) {
    reply.status(503).send({ error: "cron_not_configured" });
    return false;
  }

  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : header;

  if (!secretEquals(token, env.cronSecret)) {
    reply.status(401).send({ error: "unauthorized" });
    return false;
  }

  return true;
}
