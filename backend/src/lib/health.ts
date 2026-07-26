import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { isWhatsAppProviderConfigured } from "../services/whatsapp/provider.js";

const HEALTH_TTL_MS = 30_000;
let cachedHealth: { at: number; status: HealthStatus } | null = null;

export interface HealthStatus {
  status: "ok" | "degraded";
  service: string;
  checks: Record<string, "ok" | "error" | "skipped">;
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const now = Date.now();
  if (cachedHealth && now - cachedHealth.at < HEALTH_TTL_MS) {
    return cachedHealth.status;
  }

  const checks: Record<string, "ok" | "error" | "skipped"> = {
    supabase: "skipped",
    openai:
      env.openaiApiKey && !env.openaiApiKey.includes("placeholder") ? "ok" : "skipped",
    whatsapp: isWhatsAppProviderConfigured() ? "ok" : "skipped",
    stripe: env.stripeSecretKey ? "ok" : "skipped",
    google: env.googleClientId ? "ok" : "skipped",
  };

  if (env.isSupabaseConfigured) {
    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from("users").select("id").limit(1);
      checks.supabase = error ? "error" : "ok";
    } catch {
      checks.supabase = "error";
    }
  }

  const hasError = Object.values(checks).includes("error");
  const status: HealthStatus = {
    status: hasError ? "degraded" : "ok",
    service: "babitk-backend",
    checks,
  };
  cachedHealth = { at: Date.now(), status };
  return status;
}
