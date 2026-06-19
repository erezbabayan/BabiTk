import type { FastifyReply, FastifyRequest } from "fastify";
import {
  assertAiParseQuota,
  assertAudioQuota,
  estimateAudioSeconds,
  estimateTextParseUnits,
  isPaywallError,
} from "../services/usage.service.js";

function sendPaywall(reply: FastifyReply, code: "audio_quota" | "ai_parse_quota"): void {
  const message =
    code === "audio_quota"
      ? "הגעת למכסת התמלול החודשית. שדרג ל-Premium להמשך."
      : "הגעת למכסת ה-AI החודשית. שדרג ל-Premium להמשך.";
  reply.status(402).send({ error: "paywall", code, message });
}

export async function requireAiParseQuota(
  request: FastifyRequest,
  reply: FastifyReply,
  text?: string,
): Promise<void> {
  if (!request.user) {
    reply.status(401).send({ error: "unauthorized" });
    return;
  }

  const units = text ? estimateTextParseUnits(text) : 1;

  try {
    await assertAiParseQuota(request.user.id, units);
  } catch (error) {
    if (isPaywallError(error)) {
      sendPaywall(reply, error.code);
      return;
    }
    throw error;
  }
}

export async function requireAudioQuota(
  request: FastifyRequest,
  reply: FastifyReply,
  audioBuffer: Buffer,
): Promise<number> {
  if (!request.user) {
    reply.status(401).send({ error: "unauthorized" });
    return 0;
  }

  const seconds = estimateAudioSeconds(audioBuffer);

  try {
    await assertAudioQuota(request.user.id, seconds);
  } catch (error) {
    if (isPaywallError(error)) {
      sendPaywall(reply, "audio_quota");
      return 0;
    }
    throw error;
  }

  return seconds;
}

export function handlePaywallError(error: unknown, reply: FastifyReply): boolean {
  if (isPaywallError(error)) {
    sendPaywall(reply, error.code);
    return true;
  }
  return false;
}
