// Read-only admin listing for the external Babi Admin site (pure; node-testable).
//
// Server-to-server only: no CORS headers, GET only, verify_jwt = false.
// Auth: header `x-babi-admin-key` compared in constant time against BABI_ADMIN_READ_KEY.
// If the env secret is unset the endpoint fails closed (503).
// Each resource returns an explicit field whitelist. Never token_hash,
// request_timestamps, phones, tokens, secrets, or content.
import { timingSafeEqualString } from "./safe-compare.ts";
import { createMemorySnapRateLimiter, snapClientIp, type SnapRateLimiter } from "./snap-users.ts";

export const ADMIN_READ_RESOURCES = ["tk_users", "snap_users", "device_tokens", "activity_events"] as const;
export type AdminReadResource = (typeof ADMIN_READ_RESOURCES)[number];

export const ADMIN_READ_FIELDS: Record<AdminReadResource, readonly string[]> = {
  tk_users: ["id", "email", "created_at", "last_sign_in_at"],
  snap_users: [
    "id",
    "email",
    "install_id",
    "first_seen",
    "last_seen",
    "app_version",
    "device_label",
    "sources",
    "status",
    "created_at",
  ],
  device_tokens: ["id", "user_id", "name", "created_at", "last_used_at", "revoked_at"],
  // system 'tk' -> auth.users.id, 'snap' -> snap_users.id. day is Asia/Jerusalem.
  activity_events: ["id", "system", "user_id", "event_type", "day", "occurred_at"],
};

/** Optional filters. Only `activity_events` reads them. */
export interface AdminReadFilters {
  /** YYYY-MM-DD (Israel day), inclusive. */
  since?: string;
  system?: "tk" | "snap";
}

export const ADMIN_READ_DEFAULT_LIMIT = 100;
export const ADMIN_READ_MAX_LIMIT = 1000;
export const ADMIN_READ_MAX_OFFSET = 1_000_000;

export const ADMIN_READ_RATE = {
  windowMs: 60_000,
  perIp: 60,
  perIsolate: 300,
};

export interface AdminReadPage {
  items: Array<Record<string, unknown>>;
  total?: number;
}

export interface AdminReadStore {
  list(
    resource: AdminReadResource,
    opts: { limit: number; offset: number; filters?: AdminReadFilters },
  ): Promise<AdminReadPage>;
}

export interface AdminReadDeps {
  key: string;
  store: AdminReadStore;
  limiter?: SnapRateLimiter;
  now?: () => Date;
  clientIp?: string;
}

const sharedLimiter = createMemorySnapRateLimiter();

export function adminReadJson(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

/** Keep only whitelisted keys; missing keys become null so the shape is stable. */
export function pickFields(resource: AdminReadResource, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of ADMIN_READ_FIELDS[resource]) {
    out[field] = row[field] ?? null;
  }
  return out;
}

function parseIntParam(raw: string | null, fallback: number): number | null {
  if (raw === null || raw === "") return fallback;
  if (!/^\d{1,7}$/.test(raw)) return null;
  return Number(raw);
}

function parseDay(raw: string | null): string | null | undefined {
  if (raw === null || raw === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return null;
  return raw;
}

function isResource(v: string | null): v is AdminReadResource {
  return v !== null && (ADMIN_READ_RESOURCES as readonly string[]).includes(v);
}

export async function handleAdminRead(req: Request, deps: AdminReadDeps): Promise<Response> {
  if (req.method !== "GET") {
    return adminReadJson({ ok: false, error: "method not allowed" }, 405, { Allow: "GET" });
  }
  if (!deps.key) {
    return adminReadJson({ ok: false, error: "not configured" }, 503);
  }

  const limiter = deps.limiter ?? sharedLimiter;
  const nowMs = (deps.now ?? (() => new Date()))().getTime();
  const ip = deps.clientIp ?? snapClientIp(req);
  for (const [bucket, limit] of [
    ["admin-read:isolate", ADMIN_READ_RATE.perIsolate],
    [`admin-read:ip:${ip}`, ADMIN_READ_RATE.perIp],
  ] as const) {
    const r = limiter.take(bucket, limit, nowMs, ADMIN_READ_RATE.windowMs);
    if (!r.allowed) {
      return adminReadJson({ ok: false, error: "rate limited" }, 429, { "Retry-After": String(r.retryAfterSeconds) });
    }
  }

  const provided = req.headers.get("x-babi-admin-key") ?? "";
  if (!provided || !timingSafeEqualString(provided, deps.key)) {
    return adminReadJson({ ok: false, error: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const resource = url.searchParams.get("resource");
  if (!isResource(resource)) {
    return adminReadJson({ ok: false, error: "unknown resource", resources: ADMIN_READ_RESOURCES }, 400);
  }
  const limit = parseIntParam(url.searchParams.get("limit"), ADMIN_READ_DEFAULT_LIMIT);
  const offset = parseIntParam(url.searchParams.get("offset"), 0);
  if (limit === null || limit < 1 || offset === null || offset > ADMIN_READ_MAX_OFFSET) {
    return adminReadJson({ ok: false, error: "invalid limit or offset" }, 400);
  }
  const clamped = Math.min(limit, ADMIN_READ_MAX_LIMIT);

  let filters: AdminReadFilters | undefined;
  if (resource === "activity_events") {
    const since = parseDay(url.searchParams.get("since"));
    const systemRaw = url.searchParams.get("system");
    if (since === null) {
      return adminReadJson({ ok: false, error: "invalid since (YYYY-MM-DD)" }, 400);
    }
    if (systemRaw !== null && systemRaw !== "" && systemRaw !== "tk" && systemRaw !== "snap") {
      return adminReadJson({ ok: false, error: "invalid system (tk|snap)" }, 400);
    }
    filters = {};
    if (since) filters.since = since;
    if (systemRaw === "tk" || systemRaw === "snap") filters.system = systemRaw;
  }

  const page = await deps.store.list(resource, filters ? { limit: clamped, offset, filters } : { limit: clamped, offset });
  const items = page.items.slice(0, clamped).map((row) => pickFields(resource, row));
  const body: Record<string, unknown> = { resource, items, limit: clamped, offset };
  if (typeof page.total === "number") body.total = page.total;
  return adminReadJson(body, 200);
}
