import { getSupabaseAdmin } from "../lib/supabase.js";

export type UsageEventType = "audio" | "ai_parse" | "ocr";

export class UsageQuotaExceededError extends Error {
  readonly code: "audio_quota" | "ai_parse_quota";

  constructor(code: "audio_quota" | "ai_parse_quota", message?: string) {
    super(
      message ??
        (code === "audio_quota"
          ? "Audio transcription quota exceeded"
          : "AI parse quota exceeded"),
    );
    this.name = "UsageQuotaExceededError";
    this.code = code;
  }
}

export interface UsageSummary {
  tier: "free" | "premium";
  audio: { used: number; allocated: number; remaining: number };
  aiParses: { used: number; allocated: number; remaining: number };
  periodStart: string;
  isPremium: boolean;
}

interface UserUsageRow {
  tier: "free" | "premium";
  allocated_audio_seconds: number;
  used_audio_seconds: number;
  allocated_ai_parses: number;
  used_ai_parses: number;
  usage_period_start: string;
}

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/** Rough OpenAI token estimate (~4 chars per token for Hebrew/English mix). */
const CHARS_PER_TOKEN = 4;

export function estimateTextParseUnits(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 1;
  return Math.max(1, Math.ceil(trimmed.length / CHARS_PER_TOKEN));
}

export function estimateAudioSeconds(buffer: Buffer): number {
  return Math.max(1, Math.ceil(buffer.length / 16_000));
}

async function loadUserUsage(userId: string): Promise<UserUsageRow> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select(
      "tier, allocated_audio_seconds, used_audio_seconds, allocated_ai_parses, used_ai_parses, usage_period_start",
    )
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to load user quota: ${error?.message ?? "not found"}`);
  }

  return data as UserUsageRow;
}

export async function resetUsagePeriodIfNeeded(userId: string): Promise<UserUsageRow> {
  const user = await loadUserUsage(userId);
  const periodStart = new Date(user.usage_period_start).getTime();
  const expired = Date.now() - periodStart > PERIOD_MS;

  if (!expired) return user;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .update({
      used_audio_seconds: 0,
      used_ai_parses: 0,
      usage_period_start: new Date().toISOString(),
    })
    .eq("id", userId)
    .select(
      "tier, allocated_audio_seconds, used_audio_seconds, allocated_ai_parses, used_ai_parses, usage_period_start",
    )
    .single();

  if (error || !data) {
    throw new Error(`Failed to reset usage period: ${error?.message}`);
  }

  return data as UserUsageRow;
}

export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const user = await resetUsagePeriodIfNeeded(userId);
  const isPremium = user.tier === "premium";

  return {
    tier: user.tier,
    isPremium,
    periodStart: user.usage_period_start,
    audio: {
      used: user.used_audio_seconds,
      allocated: user.allocated_audio_seconds,
      remaining: Math.max(0, user.allocated_audio_seconds - user.used_audio_seconds),
    },
    aiParses: {
      used: user.used_ai_parses,
      allocated: user.allocated_ai_parses,
      remaining: Math.max(0, user.allocated_ai_parses - user.used_ai_parses),
    },
  };
}

export async function assertAudioQuota(userId: string, audioSeconds: number): Promise<void> {
  const user = await resetUsagePeriodIfNeeded(userId);
  if (user.tier === "premium") return;

  if (user.used_audio_seconds + audioSeconds > user.allocated_audio_seconds) {
    throw new UsageQuotaExceededError("audio_quota");
  }
}

export async function assertAiParseQuota(userId: string, units = 1): Promise<void> {
  const user = await resetUsagePeriodIfNeeded(userId);
  if (user.tier === "premium") return;

  if (user.used_ai_parses + units > user.allocated_ai_parses) {
    throw new UsageQuotaExceededError("ai_parse_quota");
  }
}

async function logUsageEvent(
  userId: string,
  eventType: UsageEventType,
  units: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from("usage_events").insert({
    user_id: userId,
    event_type: eventType,
    units,
    metadata: metadata ?? {},
  });
}

export async function incrementAudioUsage(
  userId: string,
  audioSeconds: number,
): Promise<void> {
  const user = await loadUserUsage(userId);
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("users")
    .update({ used_audio_seconds: user.used_audio_seconds + audioSeconds })
    .eq("id", userId);

  if (error) throw new Error(`Failed to update audio usage: ${error.message}`);
  await logUsageEvent(userId, "audio", audioSeconds);
}

export async function incrementAiParseUsage(
  userId: string,
  eventType: "ai_parse" | "ocr" = "ai_parse",
  units = 1,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const user = await loadUserUsage(userId);
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("users")
    .update({ used_ai_parses: user.used_ai_parses + units })
    .eq("id", userId);

  if (error) throw new Error(`Failed to update AI parse usage: ${error.message}`);
  await logUsageEvent(userId, eventType, units, metadata);
}

export function isPaywallError(error: unknown): error is UsageQuotaExceededError {
  return error instanceof UsageQuotaExceededError;
}
