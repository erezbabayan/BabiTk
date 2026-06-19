import type { FastifyReply, FastifyRequest } from "fastify";
import { getSupabaseAuthClient } from "../lib/supabase.js";

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
