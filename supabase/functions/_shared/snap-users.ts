// BabiSnap user registry logic (pure; no Deno/npm imports so it is node-testable).
import { timingSafeEqualString } from "./safe-compare.ts";

export type SnapStatus = "active" | "blocked" | "disconnected";
export type SnapEvent = "signin" | "heartbeat" | "disconnect";
export const SNAP_SOURCES = ["google_calendar", "babitk"] as const;

export interface SnapUserRow {
  email: string;
  install_id: string;
  status: SnapStatus;
  sources: string[];
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
}

export const SNAP_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Max-Age": "86400",
};

export function snapJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SNAP_CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function bearerMatches(header: string | null, key: string): boolean {
  if (!key || !header) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return !!m && timingSafeEqualString(m[1].trim(), key);
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

export async function handleSnapUsers(
  req: Request,
  deps: { key: string; store: SnapUsersStore; now?: () => Date },
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: SNAP_CORS_HEADERS });
  if (!deps.key) return snapJson({ ok: false, error: "server not configured" }, 500);
  if (!bearerMatches(req.headers.get("authorization"), deps.key)) {
    return snapJson({ ok: false, error: "unauthorized" }, 401);
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const email = normalizeEmail(url.searchParams.get("email"));
    const installId = normalizeInstallId(url.searchParams.get("install_id"));
    if (!email || !installId) return snapJson({ ok: false, error: "email and install_id required" }, 400);
    const row = await deps.store.find(email, installId);
    // Unknown users are reported as "disconnected" (200, known:false) so the app has one code path.
    return snapJson({ status: row?.status ?? "disconnected", known: !!row }, 200);
  }

  if (req.method !== "POST") return snapJson({ ok: false, error: "method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object") throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return snapJson({ ok: false, error: "invalid json" }, 400);
  }
  const email = normalizeEmail(body.email);
  const installId = normalizeInstallId(body.install_id);
  const event = body.event;
  if (!email || !installId) return snapJson({ ok: false, error: "email and install_id required" }, 400);
  if (event !== "signin" && event !== "heartbeat" && event !== "disconnect") {
    return snapJson({ ok: false, error: "invalid event" }, 400);
  }

  const existing = await deps.store.find(email, installId);
  const status = nextStatus(existing?.status ?? null, event);
  const sources = [...new Set([...(existing?.sources ?? []), ...normalizeSources(body.sources)])];
  const row: Parameters<SnapUsersStore["upsert"]>[0] = {
    email,
    install_id: installId,
    status,
    sources,
    last_seen: (deps.now?.() ?? new Date()).toISOString(),
  };
  const appVersion = shortText(body.app_version, 64);
  const deviceLabel = shortText(body.device_label, 120);
  if (appVersion !== undefined) row.app_version = appVersion;
  if (deviceLabel !== undefined) row.device_label = deviceLabel;
  await deps.store.upsert(row);
  return snapJson({ ok: true, status }, 200);
}
