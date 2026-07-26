import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { getSupabaseAuthClient } from "../lib/supabase.js";
import { SYNC_USER_ID } from "../services/sync-store.service.js";

export interface AuthenticatedUser {
  id: string;
  email?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    rawBody?: Buffer;
  }
}

const DEMO_BEARER_TOKEN = "demo";

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    reply.status(401).send({ error: "unauthorized", message: "Missing Bearer token" });
    return;
  }

  const token = header.slice("Bearer ".length);

  if (
    !env.isSupabaseAuthConfigured &&
    env.demoSyncEnabled &&
    token === DEMO_BEARER_TOKEN
  ) {
    request.user = {
      id: SYNC_USER_ID,
      email: "demo@mindtasker.local",
    };
    return;
  }

  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    reply.status(401).send({ error: "unauthorized", message: "Invalid token" });
    return;
  }

  request.user = {
    id: data.user.id,
    email: data.user.email,
  };
}