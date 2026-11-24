// Silent BabiTk usage note for Edge Functions that serve a signed-in user.
//
// One call after the request succeeded:
//   noteTkActivity(userId, "voice_record");
//
// - Synchronous, never throws, never awaited: the response, its status and
//   its latency do not change. The write runs in the background
//   (EdgeRuntime.waitUntil) with a 2s timeout and is dropped on any error.
// - Writes only system='tk' + user id + event type + Israel day into
//   public.activity_events (ON CONFLICT DO NOTHING). Never content.
// - The service-role client here is used for this telemetry insert only
//   (activity_events has RLS on and no policies); request handling keeps
//   whatever client it already used.

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  createSupabaseActivityRecorder,
  type ActivityEventType,
  type ActivityRecorder,
} from "./activity-events.ts";

// Module-level so the in-memory per-day dedup survives across requests in this isolate.
let recorder: ActivityRecorder | null | undefined;

function envValue(name: string): string {
  try {
    const deno = (globalThis as { Deno?: { env?: { get(key: string): string | undefined } } }).Deno;
    return deno?.env?.get(name) ?? "";
  } catch {
    return "";
  }
}

function tkRecorder(): ActivityRecorder | null {
  if (recorder !== undefined) return recorder;
  const url = envValue("SUPABASE_URL");
  const key = envValue("SUPABASE_SERVICE_ROLE_KEY");
  recorder = url && key
    ? createSupabaseActivityRecorder(
      createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    )
    : null;
  return recorder;
}

/** Fire-and-forget. Never throws and never changes the caller's response. */
export function noteTkActivity(userId: string | null | undefined, eventType: ActivityEventType): void {
  try {
    if (!userId) return;
    tkRecorder()?.record("tk", userId, eventType);
  } catch {
    // Telemetry must never affect a BabiTk request.
  }
}
