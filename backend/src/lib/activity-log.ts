import { env } from "../config/env.js";
import { getSupabaseAdmin } from "./supabase.js";
import {
  createSupabaseActivityRecorder,
  type ActivityEventType,
  type ActivityRecorder,
} from "./activity-events.js";

// Babi Admin activity log for the Fastify backend. Fire-and-forget: never
// throws, never awaited, never changes a response. No-op without Supabase.
let recorder: ActivityRecorder | null = null;

export function noteBackendActivity(userId: string | undefined, eventType: ActivityEventType): void {
  try {
    if (!userId || !env.isSupabaseConfigured) return;
    recorder ??= createSupabaseActivityRecorder(getSupabaseAdmin());
    recorder.record("tk", userId, eventType);
  } catch {
    // Telemetry must never affect the request.
  }
}
