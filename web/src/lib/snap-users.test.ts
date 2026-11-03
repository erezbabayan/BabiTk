import assert from "node:assert/strict";
import { test } from "node:test";

import {
  handleSnapUsers,
  type SnapUsersStore,
  type SnapUserRow,
} from "../../../supabase/functions/_shared/snap-users.ts";

const KEY = "test-key";
function mem() {
  const rows = new Map<string, SnapUserRow & Record<string, unknown>>();
  const store: SnapUsersStore = {
    async find(e, i) { return rows.get(`${e}|${i}`) ?? null; },
    async upsert(r) { rows.set(`${r.email}|${r.install_id}`, { ...rows.get(`${r.email}|${r.install_id}`), ...r }); },
  };
  return { rows, store };
}
const post = (body: unknown, key = KEY) =>
  new Request("https://x/functions/v1/snap-users", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("rejects wrong key", async () => {
  const { store } = mem();
  const res = await handleSnapUsers(post({}, "nope"), { key: KEY, store });
  assert.equal(res.status, 401);
});

test("signin lowercases email, merges sources, blocked stays blocked", async () => {
  const { rows, store } = mem();
  let res = await handleSnapUsers(post({ email: "A@B.com", install_id: "i1", event: "signin", sources: ["babitk", "evil"] }), { key: KEY, store });
  assert.deepEqual(await res.json(), { ok: true, status: "active" });
  await handleSnapUsers(post({ email: "a@b.com", install_id: "i1", event: "heartbeat", sources: ["google_calendar"] }), { key: KEY, store });
  assert.deepEqual(rows.get("a@b.com|i1")!.sources, ["babitk", "google_calendar"]);
  rows.get("a@b.com|i1")!.status = "blocked";
  res = await handleSnapUsers(post({ email: "a@b.com", install_id: "i1", event: "signin" }), { key: KEY, store });
  assert.equal((await res.json()).status, "blocked");
  res = await handleSnapUsers(post({ email: "a@b.com", install_id: "i1", event: "disconnect" }), { key: KEY, store });
  assert.equal((await res.json()).status, "blocked");
});

test("disconnect and GET status", async () => {
  const { store } = mem();
  await handleSnapUsers(post({ email: "c@d.com", install_id: "i2", event: "disconnect" }), { key: KEY, store });
  const get = (q: string) => handleSnapUsers(new Request(`https://x/?${q}`, { headers: { authorization: `Bearer ${KEY}` } }), { key: KEY, store });
  assert.deepEqual(await (await get("email=C@d.com&install_id=i2")).json(), { status: "disconnected", known: true });
  assert.deepEqual(await (await get("email=z@d.com&install_id=i9")).json(), { status: "disconnected", known: false });
  assert.equal((await get("email=bad")).status, 400);
});
