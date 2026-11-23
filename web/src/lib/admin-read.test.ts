import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  ADMIN_READ_FIELDS,
  ADMIN_READ_MAX_LIMIT,
  handleAdminRead,
  type AdminReadResource,
  type AdminReadStore,
} from "../../../supabase/functions/_shared/admin-read.ts";
import type { SnapRateLimiter } from "../../../supabase/functions/_shared/snap-users.ts";

const KEY = "test-admin-read-key";
const BASE = "https://example.test/functions/v1/admin-read";

function allowAll(): SnapRateLimiter {
  return { take: () => ({ allowed: true, retryAfterSeconds: 0 }) };
}

// Rows carry extra sensitive columns; the handler must drop them.
const ROWS: Record<AdminReadResource, Array<Record<string, unknown>>> = {
  tk_users: [
    {
      id: "u1",
      email: "a@example.com",
      created_at: "2026-01-01T00:00:00Z",
      last_sign_in_at: null,
      phone: "+972500000000",
      user_metadata: { name: "x" },
    },
  ],
  snap_users: [
    {
      id: "s1",
      email: "a@example.com",
      install_id: "inst",
      first_seen: "2026-01-01T00:00:00Z",
      last_seen: "2026-01-02T00:00:00Z",
      app_version: "1.0",
      device_label: "Pixel",
      sources: ["babitk"],
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    },
  ],
  device_tokens: [
    {
      id: "d1",
      user_id: "u1",
      name: "BabiSnap",
      created_at: "2026-01-01T00:00:00Z",
      last_used_at: null,
      revoked_at: null,
      token_hash: "f".repeat(64),
      request_timestamps: ["2026-01-01T00:00:00Z"],
    },
  ],
};

function store(calls: Array<{ resource: string; limit: number; offset: number }> = []): AdminReadStore {
  return {
    async list(resource, opts) {
      calls.push({ resource, ...opts });
      return { items: ROWS[resource], total: ROWS[resource].length };
    },
  };
}

function req(query: string, init: RequestInit = {}, key: string | null = KEY): Request {
  const headers = new Headers(init.headers);
  if (key !== null) headers.set("x-babi-admin-key", key);
  return new Request(`${BASE}${query}`, { ...init, headers });
}

test("admin-read: missing key -> 401", async () => {
  const res = await handleAdminRead(req("?resource=tk_users", {}, null), { key: KEY, store: store(), limiter: allowAll() });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("admin-read: wrong key -> 401 and the store is not called", async () => {
  const calls: Array<{ resource: string; limit: number; offset: number }> = [];
  const res = await handleAdminRead(req("?resource=tk_users", {}, "nope"), { key: KEY, store: store(calls), limiter: allowAll() });
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test("admin-read: Bearer header is not accepted in place of x-babi-admin-key", async () => {
  const res = await handleAdminRead(
    req("?resource=tk_users", { headers: { Authorization: `Bearer ${KEY}` } }, null),
    { key: KEY, store: store(), limiter: allowAll() },
  );
  assert.equal(res.status, 401);
});

test("admin-read: unset env secret fails closed with 503", async () => {
  const res = await handleAdminRead(req("?resource=tk_users", {}, ""), { key: "", store: store(), limiter: allowAll() });
  assert.equal(res.status, 503);
});

test("admin-read: non-GET methods (incl. OPTIONS) -> 405, no CORS", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const res = await handleAdminRead(req("?resource=tk_users", { method }), { key: KEY, store: store(), limiter: allowAll() });
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  }
});

test("admin-read: each resource returns exactly the whitelisted keys", async () => {
  for (const resource of ["tk_users", "snap_users", "device_tokens"] as const) {
    const res = await handleAdminRead(req(`?resource=${resource}`), { key: KEY, store: store(), limiter: allowAll() });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { resource: string; items: Array<Record<string, unknown>>; limit: number; offset: number; total: number };
    assert.equal(body.resource, resource);
    assert.equal(body.limit, 100);
    assert.equal(body.offset, 0);
    assert.equal(body.total, 1);
    assert.equal(body.items.length, 1);
    assert.deepEqual(Object.keys(body.items[0]).sort(), [...ADMIN_READ_FIELDS[resource]].sort());
    const text = JSON.stringify(body);
    assert.doesNotMatch(text, /token_hash|request_timestamps|phone|user_metadata|updated_at/);
  }
});

test("admin-read: whitelist never includes secrets", () => {
  const all = Object.values(ADMIN_READ_FIELDS).flat();
  for (const banned of ["token_hash", "request_timestamps", "phone", "password", "encrypted_password"]) {
    assert.equal(all.includes(banned), false, banned);
  }
});

test("admin-read: limit default, clamp and validation", async () => {
  const calls: Array<{ resource: string; limit: number; offset: number }> = [];
  const deps = { key: KEY, store: store(calls), limiter: allowAll() };
  assert.equal((await handleAdminRead(req("?resource=snap_users&limit=5000&offset=20"), deps)).status, 200);
  assert.deepEqual(calls.at(-1), { resource: "snap_users", limit: ADMIN_READ_MAX_LIMIT, offset: 20 });
  assert.equal((await handleAdminRead(req("?resource=snap_users&limit=0"), deps)).status, 400);
  assert.equal((await handleAdminRead(req("?resource=snap_users&limit=-1"), deps)).status, 400);
  assert.equal((await handleAdminRead(req("?resource=snap_users&offset=abc"), deps)).status, 400);
  assert.equal((await handleAdminRead(req("?resource=users"), deps)).status, 400);
  assert.equal((await handleAdminRead(req(""), deps)).status, 400);
});

test("admin-read: rate limited -> 429 before the key is checked", async () => {
  const deny: SnapRateLimiter = { take: () => ({ allowed: false, retryAfterSeconds: 7 }) };
  const res = await handleAdminRead(req("?resource=tk_users"), { key: KEY, store: store(), limiter: deny });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "7");
});

test("admin-read: deploy wiring keeps verify_jwt off and no service role leaks", () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const config = readFileSync(path.join(root, "supabase/config.toml"), "utf8");
  const workflow = readFileSync(path.join(root, ".github/workflows/deploy-supabase-functions.yml"), "utf8");
  const endpoint = readFileSync(path.join(root, "supabase/functions/admin-read/index.ts"), "utf8");
  assert.match(config, /\[functions\.admin-read\]\s+verify_jwt = false/);
  assert.match(workflow, /functions deploy admin-read --project-ref "\$PROJECT_REF" --import-map "\$IMPORT_MAP" --no-verify-jwt --yes\n/);
  assert.match(endpoint, /BABI_ADMIN_READ_KEY/);
  assert.doesNotMatch(endpoint, /token_hash|request_timestamps/);
});
