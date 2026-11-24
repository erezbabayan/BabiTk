// COPY of supabase/functions/_shared/activity-events.ts for the Fastify build
// (rootDir is src). backend/src/tests/activity-events.test.ts keeps them identical.
// Silent server-side activity log for the external Babi Admin site.
//
// Pure and dependency-free so Deno (Edge Functions) and Node tests share it.
// backend/src/lib/activity-events.ts is a copy for the Fastify build (rootDir).
//
// Rules:
// - Only user id + event type + Israel day + first time seen that day. Never
//   content, recordings, emails, phones or tokens.
// - Best-effort: `record()` is synchronous, never throws, never awaits the
//   write on the caller's path, and never changes a response.
// - At most one write per isolate per (system, user, event_type, Israel day);
//   the table's unique key + ON CONFLICT DO NOTHING dedups across isolates.

export const ACTIVITY_SYSTEMS = ["tk", "snap"] as const;
export type ActivitySystem = (typeof ACTIVITY_SYSTEMS)[number];

export const ACTIVITY_EVENT_TYPES = [
  "api_request", // backend Fastify requireAuth
  "sync_request", // backend Fastify sync-auth
  "device_token_use", // voice-ingest with a valid pairing/device token
  "whatsapp_message", // WhatsApp webhook, linked + verified user, capture allowed
  "calendar_api", // google-calendar with a signed-in user
  "snap_signin",
  "snap_heartbeat",
  "snap_disconnect",
  // Written by DB triggers (migration 20261124180000_activity_usage_coverage.sql).
  "login", // auth.sessions INSERT (any sign-in method)
  "session_refresh", // auth.refresh_tokens rotation / auth.sessions refreshed_at
  "board_write", // signed-in user wrote mindtasker_items / source_materials / user_tags
  // Edge Functions, after the signed-in request succeeded.
  "notebook_scan", // ingest-notebook
  "voice_record", // ingest-voice
  "voice_transcribe", // transcribe-voice-item
  "whatsapp_setup", // whatsapp-green-connect
  "whatsapp_phone_otp", // whatsapp-phone-otp
  "babisnap_pairing", // babisnap (connect / status / disconnect from the Tk app)
  "account_action", // account (export / delete)
] as const;
export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

export const ACTIVITY_TIME_ZONE = "Asia/Jerusalem";
export const ACTIVITY_WRITE_TIMEOUT_MS = 2000;
export const ACTIVITY_DEDUP_MAX_KEYS = 5000;

export interface ActivityRow {
  system: ActivitySystem;
  user_id: string;
  event_type: ActivityEventType;
  /** Calendar day in Asia/Jerusalem, YYYY-MM-DD. */
  day: string;
  occurred_at: string;
}

/** Writes one row; must be idempotent on (system, user_id, event_type, day). */
export type ActivityWrite = (row: ActivityRow, signal: AbortSignal) => Promise<void>;

export interface ActivityRecorderOptions {
  write: ActivityWrite;
  now?: () => Date;
  /** Keeps the isolate alive for the background write (EdgeRuntime.waitUntil). */
  schedule?: (task: Promise<unknown>) => void;
  timeoutMs?: number;
  maxKeys?: number;
  onError?: (error: unknown) => void;
}

export interface ActivityRecorder {
  /** Fire-and-forget. Never throws. Returns true when a write was scheduled. */
  record(system: ActivitySystem, userId: string, eventType: ActivityEventType): boolean;
  /**
   * Same, but the user id is resolved in the background (e.g. a snap_users id
   * lookup). `dedupKey` identifies the subject in memory only; it is never stored.
   */
  recordLazy(
    system: ActivitySystem,
    dedupKey: string,
    eventType: ActivityEventType,
    resolveUserId: (signal: AbortSignal) => Promise<string | null>,
  ): boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isActivityUserId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isActivityEventType(v: unknown): v is ActivityEventType {
  return typeof v === "string" && (ACTIVITY_EVENT_TYPES as readonly string[]).includes(v);
}

export function isActivitySystem(v: unknown): v is ActivitySystem {
  return typeof v === "string" && (ACTIVITY_SYSTEMS as readonly string[]).includes(v);
}

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ACTIVITY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD in Asia/Jerusalem. */
export function activityDay(now: Date): string {
  const parts = dayFormatter.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** EdgeRuntime.waitUntil when present; otherwise let the promise run detached. */
export function defaultActivitySchedule(task: Promise<unknown>): void {
  const runtime = (globalThis as {
    EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(task);
    return;
  }
  void task;
}

function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  // Node: do not keep the process alive for a telemetry timer.
  (timer as unknown as { unref?: () => void }).unref?.();
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

export function createActivityRecorder(opts: ActivityRecorderOptions): ActivityRecorder {
  const seen = new Map<string, true>();
  const maxKeys = Math.max(1, opts.maxKeys ?? ACTIVITY_DEDUP_MAX_KEYS);
  const timeoutMs = opts.timeoutMs ?? ACTIVITY_WRITE_TIMEOUT_MS;
  const schedule = opts.schedule ?? defaultActivitySchedule;
  const onError = opts.onError ?? (() => {});

  function remember(key: string): boolean {
    if (seen.has(key)) return false;
    if (seen.size >= maxKeys) {
      // Map keeps insertion order: drop the oldest key.
      const oldest = seen.keys().next().value;
      if (oldest !== undefined) seen.delete(oldest);
    }
    seen.set(key, true);
    return true;
  }

  function start(
    key: string,
    system: ActivitySystem,
    eventType: ActivityEventType,
    resolve: (signal: AbortSignal) => Promise<string | null>,
    at: Date,
  ): boolean {
    const day = activityDay(at);
    const fullKey = `${system}|${eventType}|${day}|${key}`;
    if (!remember(fullKey)) return false;
    const { signal, clear } = timeoutSignal(timeoutMs);
    const task = (async () => {
      const userId = await resolve(signal);
      if (!isActivityUserId(userId)) return;
      await opts.write(
        { system, user_id: userId.toLowerCase(), event_type: eventType, day, occurred_at: at.toISOString() },
        signal,
      );
    })()
      .catch((error) => {
        // Let a later request retry today's row.
        seen.delete(fullKey);
        try {
          onError(error);
        } catch {
          // ignore
        }
      })
      .finally(clear);
    schedule(task);
    return true;
  }

  return {
    record(system, userId, eventType) {
      try {
        if (!isActivitySystem(system) || !isActivityEventType(eventType) || !isActivityUserId(userId)) {
          return false;
        }
        const at = (opts.now ?? (() => new Date()))();
        const id = userId.toLowerCase();
        return start(id, system, eventType, async () => id, at);
      } catch (error) {
        try {
          onError(error);
        } catch {
          // ignore
        }
        return false;
      }
    },
    recordLazy(system, dedupKey, eventType, resolveUserId) {
      try {
        if (!isActivitySystem(system) || !isActivityEventType(eventType)) return false;
        if (typeof dedupKey !== "string" || !dedupKey) return false;
        const at = (opts.now ?? (() => new Date()))();
        return start(`lazy:${dedupKey}`, system, eventType, resolveUserId, at);
      } catch (error) {
        try {
          onError(error);
        } catch {
          // ignore
        }
        return false;
      }
    },
  };
}

/** Minimal shape of a supabase-js client used for the write. */
export interface ActivityDb {
  from(table: "activity_events"): {
    upsert(
      row: ActivityRow,
      opts: { onConflict: string; ignoreDuplicates: boolean },
    ): { abortSignal(signal: AbortSignal): PromiseLike<{ error: { message: string } | null }> };
  };
}

/** INSERT ... ON CONFLICT (system, user_id, event_type, day) DO NOTHING. */
export function supabaseActivityWrite(db: ActivityDb): ActivityWrite {
  return async (row, signal) => {
    const { error } = await db
      .from("activity_events")
      .upsert(row, { onConflict: "system,user_id,event_type,day", ignoreDuplicates: true })
      .abortSignal(signal);
    if (error) throw new Error(error.message);
  };
}

/** Recorder bound to a supabase-js service-role client; logs only a short error tag. */
export function createSupabaseActivityRecorder(db: unknown): ActivityRecorder {
  return createActivityRecorder({
    write: supabaseActivityWrite(db as ActivityDb),
    onError: (error) => {
      const name = error instanceof Error ? error.name : "error";
      console.warn("activity_events write skipped", name);
    },
  });
}
