// BabiSnap user registry logic (pure; no Deno/npm imports so it is node-testable).
//
// Keys (Bearer token, constant-time compare):
// - clientKey (SNAP_REGISTRY_CLIENT_KEY): signin, heartbeat, disconnect, GET status.
// - adminKey (SNAP_REGISTRY_ADMIN_KEY): block, unblock, list. Never ship this in the APK.
// - legacyKey (SNAP_REGISTRY_KEY): temporary client-only fallback for the current APK.
//   It cannot block, list, or unblock. Remove it after BabiSnap rotates to the client key.
// If the admin key is identical to the client or legacy key, admin power is not granted.
//
// Rate limits are an in-memory sliding window on this isolate. Supabase Edge does not
// share memory across isolates, so the caps are best-effort, not a global quota.
import { timingSafeEqualString } from "./safe-compare.ts";

export type SnapStatus = "active" | "blocked" | "disconnected";
export type SnapEvent = "signin" | "heartbeat" | "disconnect";
export type SnapAdminEvent = "block" | "unblock" | "list";
export const SNAP_SOURCES = ["google_calendar", "babitk"] as const;

export interface SnapUserRow {
  email: string;
  install_id: string;
  status: SnapStatus;
  sources: string[];
}

export interface SnapAdminRow {
  email: string;
  install_id: string;
  status: SnapStatus;
  sources: string[];
  last_seen: string | null;
  app_version: string | null;
  device_label: string | null;
}

export interface SnapUsersStore {
  find(email: string, installId: string): Promise<SnapUserRow | null>;
  upsert(row: {
    email: string;
    install_id: string;
    status: SnapStatus;
    sources: string[];
    last_seen: string;
    app_version?: string | null;
    device_label?: string | null;
  }): Promise<void>;
  /** Newest rows first. `email` filters to one address. `limit` is already clamped. */
  list(opts: { email?: string; limit: number }): Promise<SnapAdminRow[]>;
  /**
   * Admin status write.
   * - installId set and the row exists: update that row only (do not bump last_seen).
   * - installId set and the row is missing: insert a row only when status is "blocked".
   * - installId null: update every current row for the email; do not insert.
   * Returns how many rows were written.
   */
  setStatus(email: string, installId: string | null, status: SnapStatus, nowIso: string): Promise<number>;
}

/**
 * Per-minute caps for one Edge isolate.
 * GET is tighter than POST because `known: true/false` can be used to probe emails.
 * `getPerIsolate` still applies when the caller spoofs X-Forwarded-For.
 */
export const SNAP_RATE: SnapRatePolicy = {
  windowMs: 60_000,
  /** signin / heartbeat / disconnect. 30/min is one call every 2s for a single install. */
  postPerInstall: 30,
  /** Shared address (NAT). Several devices can heartbeat without sharing one install id. */
  postPerIp: 60,
  /** Write ceiling for this isolate when the caller rotates install ids or spoofs IP. */
  postPerIsolate: 600,
  /** GET status. Tighter because the body reports known:true/false (email probe). */
  getPerInstall: 10,
  getPerIp: 20,
  /** GET ceiling for this isolate when X-Forwarded-For is spoofed. */
  getPerIsolate: 120,
};

export interface SnapRatePolicy {
  windowMs: number;
  postPerInstall: number;
  postPerIp: number;
  postPerIsolate: number;
  getPerInstall: number;
  getPerIp: number;
  getPerIsolate: number;
}

export interface SnapRateLimiter {
  take(
    key: string,
    limit: number,
    nowMs: number,
    windowMs: number,
  ): { allowed: boolean; retryAfterSeconds: number };
}

export interface SnapUsersDeps {
  /** @deprecated Alias of clientKey. Existing callers and tests. */
  key?: string;
  clientKey?: string;
  adminKey?: string;
  /** Old SNAP_REGISTRY_KEY. Client events only. */
  legacyKey?: string;
  store: SnapUsersStore;
  now?: () => Date;
  limiter?: SnapRateLimiter;
  rate?: SnapRatePolicy;
  /** Overrides IP parsing. Tests use this. */
  clientIp?: string;
}

export const SNAP_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Expose-Headers": "Retry-After",
  "Access-Control-Max-Age": "86400",
};

const sharedLimiter = createMemorySnapRateLimiter();

export function createMemorySnapRateLimiter(maxKeys = 4000): SnapRateLimiter {
  const buckets = new Map<string, number[]>();
  return {
    take(key, limit, nowMs, windowMs) {
      const cutoff = nowMs - windowMs;
      const prev = (buckets.get(key) ?? []).filter((t) => t > cutoff);
      buckets.delete(key);
      if (prev.length >= limit) {
        buckets.set(key, prev);
        const retryAfterSeconds = Math.max(1, Math.ceil((prev[0] + windowMs - nowMs) / 1000));
        return { allowed: false, retryAfterSeconds };
      }
      prev.push(nowMs);
      buckets.set(key, prev);
      while (buckets.size > maxKeys) {
        const oldest = buckets.keys().next().value;
        if (oldest === undefined) break;
        buckets.delete(oldest);
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

export function snapJson(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SNAP_CORS_HEADERS, "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  const token = m[1].trim();
  return token || null;
}

export function bearerMatches(header: string | null, key: string): boolean {
  const token = bearerToken(header);
  if (!key || !token) return false;
  return timingSafeEqualString(token, key);
}

export type SnapRole = "admin" | "client" | "none";

/** Compares every configured key. Admin is ignored when it collides with a client credential. */
export function resolveSnapRole(
  authorization: string | null,
  keys: { clientKey: string; adminKey: string; legacyKey: string },
): SnapRole {
  const token = bearerToken(authorization);
  if (!token) return "none";
  const adminOk = keys.adminKey.length > 0 && timingSafeEqualString(token, keys.adminKey);
  const clientOk = keys.clientKey.length > 0 && timingSafeEqualString(token, keys.clientKey);
  const legacyOk = keys.legacyKey.length > 0 && timingSafeEqualString(token, keys.legacyKey);
  if (adminOk && !clientOk && !legacyOk) return "admin";
  if (clientOk || legacyOk) return "client";
  return "none";
}

export function snapClientIp(req: Request): string {
  const cf = singleIp(req.headers.get("cf-connecting-ip"));
  if (cf) return cf;
  const real = singleIp(req.headers.get("x-real-ip"));
  if (real) return real;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0];
    const ip = singleIp(first ?? null);
    if (ip) return ip;
  }
  return "unknown";
}

function singleIp(value: string | null): string | null {
  if (!value) return null;
  const s = value.trim();
  if (!s || s.length > 80 || /[\s,]/.test(s)) return null;
  return s;
}

export function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return e.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

export function normalizeInstallId(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 && s.length <= 200 ? s : null;
}

function shortText(v: unknown, max: number): string | null | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") return undefined;
  const s = v.trim().slice(0, max);
  return s || undefined;
}

export function normalizeSources(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((s): s is string =>
    typeof s === "string" && (SNAP_SOURCES as readonly string[]).includes(s)
  ))];
}

export function nextStatus(existing: SnapStatus | null, event: SnapEvent): SnapStatus {
  if (existing === "blocked") return "blocked";
  return event === "disconnect" ? "disconnected" : "active";
}

function clampLimit(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : 50;
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

function rateLimited(retryAfterSeconds: number): Response {
  return snapJson(
    { ok: false, error: "rate_limited", retry_after_seconds: retryAfterSeconds },
    429,
    { "Retry-After": String(retryAfterSeconds) },
  );
}

function forbid(): Response {
  return snapJson({ ok: false, error: "forbidden" }, 403);
}

function clientLimited(
  limiter: SnapRateLimiter,
  rate: SnapRatePolicy,
  kind: "get" | "post",
  installId: string,
  ip: string,
  nowMs: number,
): number | null {
  const checks: Array<[string, number]> = kind === "get"
    ? [
      [`get:ip:${ip}`, rate.getPerIp],
      [`get:install:${installId}`, rate.getPerInstall],
      ["get:isolate", rate.getPerIsolate],
    ]
    : [
      [`post:ip:${ip}`, rate.postPerIp],
      [`post:install:${installId}`, rate.postPerInstall],
      ["post:isolate", rate.postPerIsolate],
    ];
  for (const [key, limit] of checks) {
    const result = limiter.take(key, limit, nowMs, rate.windowMs);
    if (!result.allowed) return result.retryAfterSeconds;
  }
  return null;
}

export async function handleSnapUsers(req: Request, deps: SnapUsersDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: SNAP_CORS_HEADERS });

  const clientKey = deps.clientKey ?? deps.key ?? "";
  const adminKey = deps.adminKey ?? "";
  const legacyKey = deps.legacyKey ?? "";
  if (!clientKey && !legacyKey && !adminKey) {
    return snapJson({ ok: false, error: "server not configured" }, 500);
  }

  const role = resolveSnapRole(req.headers.get("authorization"), { clientKey, adminKey, legacyKey });
  if (role === "none") return snapJson({ ok: false, error: "unauthorized" }, 401);

  const limiter = deps.limiter ?? sharedLimiter;
  const rate = deps.rate ?? SNAP_RATE;
  const now = deps.now?.() ?? new Date();
  const ip = deps.clientIp ?? snapClientIp(req);

  if (req.method === "GET") {
    if (role !== "client") return forbid();
    const url = new URL(req.url);
    const email = normalizeEmail(url.searchParams.get("email"));
    const installId = normalizeInstallId(url.searchParams.get("install_id"));
    if (!email || !installId) return snapJson({ ok: false, error: "email and install_id required" }, 400);
    const retry = clientLimited(limiter, rate, "get", installId, ip, now.getTime());
    if (retry !== null) return rateLimited(retry);
    const row = await deps.store.find(email, installId);
    // Unknown users are reported as "disconnected" (200, known:false) so the app has one code path.
    return snapJson({ status: row?.status ?? "disconnected", known: !!row }, 200);
  }

  if (req.method !== "POST") return snapJson({ ok: false, error: "method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return snapJson({ ok: false, error: "invalid json" }, 400);
  }

  const event = body.event;
  if (event === "block" || event === "unblock" || event === "list") {
    if (role !== "admin") return forbid();
    if (event === "list") {
      let email: string | undefined;
      if (body.email !== undefined && body.email !== null && body.email !== "") {
        const parsed = normalizeEmail(body.email);
        if (!parsed) return snapJson({ ok: false, error: "invalid email" }, 400);
        email = parsed;
      }
      const users = await deps.store.list({ email, limit: clampLimit(body.limit) });
      return snapJson({ ok: true, users }, 200);
    }
    const email = normalizeEmail(body.email);
    if (!email) return snapJson({ ok: false, error: "email required" }, 400);
    let installId: string | null = null;
    if (body.install_id !== undefined && body.install_id !== null && body.install_id !== "") {
      installId = normalizeInstallId(body.install_id);
      if (!installId) return snapJson({ ok: false, error: "invalid install_id" }, 400);
    }
    const status: SnapStatus = event === "block" ? "blocked" : "disconnected";
    const updated = await deps.store.setStatus(email, installId, status, now.toISOString());
    return snapJson({ ok: true, status, updated }, 200);
  }

  if (event !== "signin" && event !== "heartbeat" && event !== "disconnect") {
    return snapJson({ ok: false, error: "invalid event" }, 400);
  }
  if (role !== "client") return forbid();

  const email = normalizeEmail(body.email);
  const installId = normalizeInstallId(body.install_id);
  if (!email || !installId) return snapJson({ ok: false, error: "email and install_id required" }, 400);
  const retry = clientLimited(limiter, rate, "post", installId, ip, now.getTime());
  if (retry !== null) return rateLimited(retry);

  const existing = await deps.store.find(email, installId);
  const status = nextStatus(existing?.status ?? null, event);
  const sources = [...new Set([...(existing?.sources ?? []), ...normalizeSources(body.sources)])];
  const row: Parameters<SnapUsersStore["upsert"]>[0] = {
    email,
    install_id: installId,
    status,
    sources,
    last_seen: now.toISOString(),
  };
  const appVersion = shortText(body.app_version, 64);
  const deviceLabel = shortText(body.device_label, 120);
  if (appVersion !== undefined) row.app_version = appVersion;
  if (deviceLabel !== undefined) row.device_label = deviceLabel;
  await deps.store.upsert(row);
  return snapJson({ ok: true, status }, 200);
}
