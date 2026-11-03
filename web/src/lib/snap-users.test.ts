import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createMemorySnapRateLimiter,
  handleSnapUsers,
  SNAP_RATE,
  snapClientIp,
  type SnapRateLimiter,
  type SnapUsersDeps,
  type SnapUsersStore,
  type SnapUserRow,
} from "../../../supabase/functions/_shared/snap-users.ts";

const CLIENT = "client-key";
const ADMIN = "admin-key";
const LEGACY = "legacy-key";

function allowAll(): SnapRateLimiter {
  return { take: () => ({ allowed: true, retryAfterSeconds: 0 }) };
}

function mem() {
  const rows = new Map<string, SnapUserRow & Record<string, unknown>>();
  const store: SnapUsersStore = {
    async find(e, i) {
      const row = rows.get(`${e}|${i}`);
      if (!row) return null;
      return { email: row.email, install_id: row.install_id, status: row.status, sources: row.sources ?? [] };
    },
    async upsert(r) {
      const k = `${r.email}|${r.install_id}`;
      rows.set(k, { ...rows.get(k), ...r });
    },
    async list(opts) {
      const all = [...rows.values()].filter((r) => !opts.email || r.email === opts.email);
      all.sort((a, b) => String(b.last_seen ?? "").localeCompare(String(a.last_seen ?? "")));
      return all.slice(0, opts.limit).map((r) => ({
        email: r.email,
        install_id: r.install_id,
        status: r.status,
        sources: r.sources ?? [],
        last_seen: typeof r.last_seen === "string" ? r.last_seen : null,
        app_version: typeof r.app_version === "string" ? r.app_version : null,
        device_label: typeof r.device_label === "string" ? r.device_label : null,
      }));
    },
    async setStatus(email, installId, status, nowIso) {
      if (installId) {
        const k = `${email}|${installId}`;
        const existing = rows.get(k);
        if (existing) {
          rows.set(k, { ...existing, status });
          return 1;
        }
        if (status !== "blocked") return 0;
        rows.set(k, { email, install_id: installId, status: "blocked", sources: [], last_seen: nowIso });
        return 1;
      }
      let n = 0;
      for (const [k, row] of rows) {
        if (row.email !== email) continue;
        rows.set(k, { ...row, status });
        n += 1;
      }
      return n;
    },
  };
  return { rows, store };
}

function deps(store: SnapUsersStore, extra: Partial<SnapUsersDeps> = {}): SnapUsersDeps {
  return { clientKey: CLIENT, adminKey: ADMIN, legacyKey: LEGACY, store, limiter: allowAll(), ...extra };
}

const post = (body: unknown, key = CLIENT) =>
  new Request("https://x/functions/v1/snap-users", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const get = (q: string, key = CLIENT) =>
  new Request(`https://x/functions/v1/snap-users?${q}`, { headers: { authorization: `Bearer ${key}` } });

test("deprecated key alias still authorizes client calls", async () => {
  const { store } = mem();
  const res = await handleSnapUsers(
    post({ email: "a@b.com", install_id: "i1", event: "signin" }, CLIENT),
    { key: CLIENT, store, limiter: allowAll() },
  );
  assert.equal(res.status, 200);
  const blocked = await handleSnapUsers(
    post({ email: "a@b.com", event: "block" }, CLIENT),
    { key: CLIENT, adminKey: ADMIN, store, limiter: allowAll() },
  );
  assert.equal(blocked.status, 403);
});

test("rejects missing and wrong keys", async () => {
  const { store } = mem();
  const noHeader = new Request("https://x/functions/v1/snap-users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal((await handleSnapUsers(noHeader, deps(store))).status, 401);
  assert.equal((await handleSnapUsers(post({}, "nope"), deps(store))).status, 401);
  assert.equal((await handleSnapUsers(post({}, ""), deps(store))).status, 401);
  const unconfigured = await handleSnapUsers(post({}), deps(store, { clientKey: "", adminKey: "", legacyKey: "", key: "" }));
  assert.equal(unconfigured.status, 500);
});

test("signin lowercases email, merges sources, blocked stays blocked", async () => {
  const { rows, store } = mem();
  let res = await handleSnapUsers(
    post({ email: "A@B.com", install_id: "i1", event: "signin", sources: ["babitk", "evil"] }),
    deps(store),
  );
  assert.deepEqual(await res.json(), { ok: true, status: "active" });
  await handleSnapUsers(
    post({ email: "a@b.com", install_id: "i1", event: "heartbeat", sources: ["google_calendar"] }),
    deps(store),
  );
  assert.deepEqual(rows.get("a@b.com|i1")!.sources, ["babitk", "google_calendar"]);
  rows.get("a@b.com|i1")!.status = "blocked";
  res = await handleSnapUsers(post({ email: "a@b.com", install_id: "i1", event: "signin" }), deps(store));
  assert.equal((await res.json()).status, "blocked");
  res = await handleSnapUsers(post({ email: "a@b.com", install_id: "i1", event: "disconnect" }), deps(store));
  assert.equal((await res.json()).status, "blocked");
});

test("disconnect and GET status stay on the client contract", async () => {
  const { store } = mem();
  await handleSnapUsers(post({ email: "c@d.com", install_id: "i2", event: "signin" }), deps(store));
  await handleSnapUsers(post({ email: "c@d.com", install_id: "other", event: "signin" }), deps(store));
  await handleSnapUsers(post({ email: "c@d.com", install_id: "i2", event: "disconnect" }), deps(store));
  assert.deepEqual(await (await handleSnapUsers(get("email=C@d.com&install_id=i2"), deps(store))).json(), {
    status: "disconnected",
    known: true,
  });
  assert.deepEqual(await (await handleSnapUsers(get("email=C@d.com&install_id=other"), deps(store))).json(), {
    status: "active",
    known: true,
  });
  assert.deepEqual(await (await handleSnapUsers(get("email=z@d.com&install_id=i9"), deps(store))).json(), {
    status: "disconnected",
    known: false,
  });
  assert.equal((await handleSnapUsers(get("email=bad"), deps(store))).status, 400);
});

test("client key cannot block or list; admin key cannot sign in or read status", async () => {
  const { store } = mem();
  let lists = 0;
  let writes = 0;
  const guarded: SnapUsersStore = {
    ...store,
    async list(opts) {
      lists += 1;
      return store.list(opts);
    },
    async setStatus(email, installId, status, nowIso) {
      writes += 1;
      return store.setStatus(email, installId, status, nowIso);
    },
  };
  await handleSnapUsers(post({ email: "a@b.com", install_id: "i1", event: "signin" }), deps(guarded));

  const blocked = await handleSnapUsers(post({ email: "a@b.com", install_id: "i1", event: "block" }), deps(guarded));
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).error, "forbidden");
  const listed = await handleSnapUsers(post({ event: "list" }), deps(guarded));
  assert.equal(listed.status, 403);
  assert.equal(lists, 0);
  assert.equal(writes, 0);

  for (const event of ["signin", "heartbeat", "disconnect"] as const) {
    const res = await handleSnapUsers(post({ email: "a@b.com", install_id: "i1", event }, ADMIN), deps(guarded));
    assert.equal(res.status, 403, event);
  }
  const status = await handleSnapUsers(get("email=a@b.com&install_id=i1", ADMIN), deps(guarded));
  assert.equal(status.status, 403);
  assert.deepEqual(await (await handleSnapUsers(get("email=a@b.com&install_id=i1"), deps(guarded))).json(), {
    status: "active",
    known: true,
  });
});

test("legacy key is client-only, including when the new client key is unset", async () => {
  const { store } = mem();
  const legacyOnly = deps(store, { clientKey: "", key: "" });
  const signin = await handleSnapUsers(
    post({ email: "a@b.com", install_id: "i1", event: "signin" }, LEGACY),
    legacyOnly,
  );
  assert.equal(signin.status, 200);
  const block = await handleSnapUsers(post({ email: "a@b.com", event: "block" }, LEGACY), legacyOnly);
  assert.equal(block.status, 403);
  const list = await handleSnapUsers(post({ event: "list" }, LEGACY), deps(store));
  assert.equal(list.status, 403);
  const heartbeat = await handleSnapUsers(
    post({ email: "a@b.com", install_id: "i1", event: "heartbeat" }, LEGACY),
    deps(store),
  );
  assert.equal(heartbeat.status, 200);
});

test("identical admin and client keys do not grant admin", async () => {
  const { store } = mem();
  const collided = deps(store, { clientKey: "same", adminKey: "same", legacyKey: "" });
  const signin = await handleSnapUsers(post({ email: "a@b.com", install_id: "i1", event: "signin" }, "same"), collided);
  assert.equal(signin.status, 200);
  const block = await handleSnapUsers(post({ email: "a@b.com", install_id: "i1", event: "block" }, "same"), collided);
  assert.equal(block.status, 403);
});

test("admin block, unblock, and list", async () => {
  const { store } = mem();
  await handleSnapUsers(post({ email: "a@b.com", install_id: "i1", event: "signin" }), deps(store));
  await handleSnapUsers(post({ email: "a@b.com", install_id: "i2", event: "signin" }), deps(store));
  await handleSnapUsers(post({ email: "other@b.com", install_id: "i9", event: "signin" }), deps(store));

  const one = await handleSnapUsers(
    post({ email: "A@b.com", install_id: "i1", event: "block" }, ADMIN),
    deps(store),
  );
  assert.deepEqual(await one.json(), { ok: true, status: "blocked", updated: 1 });
  const stuck = await handleSnapUsers(post({ email: "a@b.com", install_id: "i1", event: "signin" }), deps(store));
  assert.equal((await stuck.json()).status, "blocked");
  const otherInstall = await handleSnapUsers(post({ email: "a@b.com", install_id: "i2", event: "heartbeat" }), deps(store));
  assert.equal((await otherInstall.json()).status, "active");

  const all = await handleSnapUsers(post({ email: "a@b.com", event: "block" }, ADMIN), deps(store));
  assert.equal((await all.json()).updated, 2);
  const fresh = await handleSnapUsers(post({ email: "a@b.com", install_id: "new", event: "signin" }), deps(store));
  assert.equal((await fresh.json()).status, "active");

  const pre = await handleSnapUsers(
    post({ email: "new@b.com", install_id: "pre", event: "block" }, ADMIN),
    deps(store),
  );
  assert.equal((await pre.json()).updated, 1);
  const preSignin = await handleSnapUsers(post({ email: "new@b.com", install_id: "pre", event: "signin" }), deps(store));
  assert.equal((await preSignin.json()).status, "blocked");

  const opened = await handleSnapUsers(
    post({ email: "new@b.com", install_id: "pre", event: "unblock" }, ADMIN),
    deps(store),
  );
  assert.deepEqual(await opened.json(), { ok: true, status: "disconnected", updated: 1 });
  const again = await handleSnapUsers(post({ email: "new@b.com", install_id: "pre", event: "signin" }), deps(store));
  assert.equal((await again.json()).status, "active");

  const listed = await handleSnapUsers(post({ event: "list", email: "a@b.com", limit: 1 }, ADMIN), deps(store));
  const body = await listed.json();
  assert.equal(body.ok, true);
  assert.equal(body.users.length, 1);
  assert.equal(body.users[0].email, "a@b.com");

  for (let i = 0; i < 101; i += 1) {
    await handleSnapUsers(post({ email: "many@b.com", install_id: `n${i}`, event: "signin" }), deps(store));
  }
  const capped = await handleSnapUsers(post({ event: "list", email: "many@b.com", limit: 1000 }, ADMIN), deps(store));
  assert.equal((await capped.json()).users.length, 100);
});

test("GET and POST rate limits return 429", async () => {
  const { store } = mem();
  let finds = 0;
  const counting: SnapUsersStore = {
    ...store,
    async find(e, i) {
      finds += 1;
      return store.find(e, i);
    },
  };
  let nowMs = Date.parse("2026-11-03T00:00:00Z");
  const rate = { ...SNAP_RATE, getPerInstall: 2, getPerIp: 100, getPerIsolate: 100, postPerInstall: 2, postPerIp: 100 };
  const base = deps(counting, {
    limiter: createMemorySnapRateLimiter(),
    rate,
    now: () => new Date(nowMs),
    clientIp: "203.0.113.8",
  });

  const ok1 = await handleSnapUsers(get("email=a@b.com&install_id=i1"), base);
  const ok2 = await handleSnapUsers(get("email=a@b.com&install_id=i1"), base);
  assert.equal(ok1.status, 200);
  assert.equal(ok2.status, 200);
  const limited = await handleSnapUsers(get("email=other@b.com&install_id=i1"), base);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "60");
  assert.deepEqual(await limited.json(), { ok: false, error: "rate_limited", retry_after_seconds: 60 });
  assert.equal(finds, 2);

  const otherInstall = await handleSnapUsers(get("email=a@b.com&install_id=i2"), base);
  assert.equal(otherInstall.status, 200);

  const ipLimited = deps(store, {
    limiter: createMemorySnapRateLimiter(),
    rate: { ...SNAP_RATE, getPerInstall: 100, getPerIp: 2, getPerIsolate: 100 },
    now: () => new Date(nowMs),
    clientIp: "203.0.113.9",
  });
  assert.equal((await handleSnapUsers(get("email=a@b.com&install_id=a"), ipLimited)).status, 200);
  assert.equal((await handleSnapUsers(get("email=a@b.com&install_id=b"), ipLimited)).status, 200);
  assert.equal((await handleSnapUsers(get("email=c@b.com&install_id=c"), ipLimited)).status, 429);

  const isolate = deps(store, {
    limiter: createMemorySnapRateLimiter(),
    rate: { ...SNAP_RATE, getPerInstall: 100, getPerIp: 100, getPerIsolate: 2 },
    now: () => new Date(nowMs),
  });
  assert.equal((await handleSnapUsers(get("email=a@b.com&install_id=a"), { ...isolate, clientIp: "198.51.100.1" })).status, 200);
  assert.equal((await handleSnapUsers(get("email=a@b.com&install_id=b"), { ...isolate, clientIp: "198.51.100.2" })).status, 200);
  const spoofed = await handleSnapUsers(get("email=a@b.com&install_id=c"), { ...isolate, clientIp: "198.51.100.3" });
  assert.equal(spoofed.status, 429);

  const posts = deps(store, {
    limiter: createMemorySnapRateLimiter(),
    rate,
    now: () => new Date(nowMs),
    clientIp: "203.0.113.10",
  });
  assert.equal((await handleSnapUsers(post({ email: "a@b.com", install_id: "i1", event: "heartbeat" }), posts)).status, 200);
  assert.equal((await handleSnapUsers(post({ email: "a@b.com", install_id: "i1", event: "heartbeat" }), posts)).status, 200);
  const postLimited = await handleSnapUsers(post({ email: "a@b.com", install_id: "i1", event: "signin" }), posts);
  assert.equal(postLimited.status, 429);
  assert.equal((await postLimited.json()).error, "rate_limited");

  nowMs += 60_001;
  const after = await handleSnapUsers(post({ email: "a@b.com", install_id: "i1", event: "heartbeat" }), posts);
  assert.equal(after.status, 200);

  const postIsolate = deps(store, {
    limiter: createMemorySnapRateLimiter(),
    rate: { ...SNAP_RATE, postPerInstall: 100, postPerIp: 100, postPerIsolate: 2 },
    now: () => new Date(nowMs),
  });
  assert.equal((await handleSnapUsers(post({ email: "a@b.com", install_id: "p1", event: "heartbeat" }), { ...postIsolate, clientIp: "192.0.2.1" })).status, 200);
  assert.equal((await handleSnapUsers(post({ email: "a@b.com", install_id: "p2", event: "heartbeat" }), { ...postIsolate, clientIp: "192.0.2.2" })).status, 200);
  assert.equal((await handleSnapUsers(post({ email: "a@b.com", install_id: "p3", event: "signin" }), { ...postIsolate, clientIp: "192.0.2.3" })).status, 429);
});

test("client ip header preference", () => {
  const req = new Request("https://x/", {
    headers: { "cf-connecting-ip": "203.0.113.5", "x-forwarded-for": "198.51.100.9, 203.0.113.1" },
  });
  assert.equal(snapClientIp(req), "203.0.113.5");
  const forwarded = new Request("https://x/", { headers: { "x-forwarded-for": "198.51.100.9, 203.0.113.1" } });
  assert.equal(snapClientIp(forwarded), "198.51.100.9");
  assert.equal(snapClientIp(new Request("https://x/")), "unknown");
});
