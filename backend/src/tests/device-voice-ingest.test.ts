import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { getZonedParts } from "../../../supabase/functions/_shared/zoned-time.ts";
import {
  applyVoiceRateLimit,
  generateDeviceToken,
  handleVoiceIngest,
  hashDeviceToken,
  parseVoiceIngestBody,
  voiceDueAt,
  voiceTaskContent,
  voiceTaskMetadata,
  type DeviceTokenRecord,
  type StoredVoiceTask,
  type VoiceIngestStore,
} from "../../../supabase/functions/_shared/device-voice-ingest.ts";

const NOW = new Date("2026-10-22T12:00:00+03:00");

function request(body: unknown, token = "babi_test_token_value_0123456789"): Request {
  return new Request("https://example.test/voice-ingest", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function memoryStore(options?: { revoked?: boolean; existing?: StoredVoiceTask }): VoiceIngestStore & {
  inserted: Array<{ userId: string; title: string; content: string; dueAt: string | null; metadata: Record<string, unknown> }>;
  timestamps: string[];
} {
  const device: DeviceTokenRecord = {
    id: "token-1",
    userId: "user-1",
    revokedAt: options?.revoked ? "2026-10-01T00:00:00Z" : null,
    requestTimestamps: [],
  };
  const inserted: Array<{ userId: string; title: string; content: string; dueAt: string | null; metadata: Record<string, unknown> }> = [];
  const tasks = new Map<string, StoredVoiceTask>();
  if (options?.existing) tasks.set("client-1", options.existing);
  return {
    inserted,
    timestamps: device.requestTimestamps,
    async findToken(hash) {
      const expected = await hashDeviceToken("babi_test_token_value_0123456789");
      return hash === expected ? { ...device, requestTimestamps: [...device.requestTimestamps] } : null;
    },
    async findByClientId(_userId, clientId) {
      return tasks.get(clientId) ?? null;
    },
    async saveRateLimit(_tokenId, timestamps) {
      device.requestTimestamps.splice(0, device.requestTimestamps.length, ...timestamps);
    },
    async touchToken() {},
    async insertTask(input) {
      const clientId = input.metadata.voice_client_id;
      if (typeof clientId === "string" && tasks.has(clientId)) return { conflict: true };
      const task = { id: `task-${inserted.length + 1}`, dueAt: input.dueAt };
      inserted.push(input);
      if (typeof clientId === "string") tasks.set(clientId, task);
      return task;
    },
  };
}

describe("voice ingest contract", () => {
  it("hashes the token and never needs the plaintext length to match the hash", async () => {
    const token = generateDeviceToken();
    assert.match(token, /^babi_[A-Za-z0-9_-]{20,}$/);
    const hash = await hashDeviceToken(token);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(await hashDeviceToken(token), hash);
    assert.notEqual(await hashDeviceToken(`${token}x`), hash);
  });

  it("rejects a missing title and a non-voice source", () => {
    assert.equal(parseVoiceIngestBody({ source: "voice" }).ok, false);
    assert.equal(parseVoiceIngestBody({ title: "חלב", source: "email" }).ok, false);
    const parsed = parseVoiceIngestBody({
      title: "  לקנות חלב  ",
      source: "voice",
      user_id: "someone-else",
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.value.title, "לקנות חלב");
  });

  it("builds a Jerusalem due instant and keeps the clock across DST", () => {
    const summer = voiceDueAt("2026-10-23", "15:00", NOW);
    const summerParts = getZonedParts(new Date(summer!), "Asia/Jerusalem");
    assert.equal(summerParts.hour, 15);
    assert.equal(summerParts.day, 23);
    assert.match(summer!, /\+03:00$/);

    const winter = voiceDueAt("2026-10-30", "15:00", NOW);
    const winterParts = getZonedParts(new Date(winter!), "Asia/Jerusalem");
    assert.equal(winterParts.hour, 15);
    assert.equal(winterParts.day, 30);
    assert.match(winter!, /\+02:00$/);

    const dateOnly = voiceDueAt("2026-10-23", null, NOW);
    assert.match(dateOnly!, /T09:00:00\+03:00$/);
    assert.equal(voiceDueAt(null, null, NOW), null);
  });

  it("puts location in the note body and arms the reminder like a manual due", () => {
    assert.equal(voiceTaskContent("ליד הסופר", "רחוב הרצל 1"), "ליד הסופר\nמיקום: רחוב הרצל 1");
    const dueAt = "2026-10-23T15:00:00+03:00";
    const metadata = voiceTaskMetadata({ clientId: "pi-1", location: "רחוב הרצל 1", dueAt });
    assert.equal(metadata.source, "voice");
    assert.equal(metadata.reminder_manual, true);
    assert.equal(metadata.reminder_sent, false);
    const analysis = metadata.analysis as { notify_at: string; target_at: string };
    assert.equal(analysis.notify_at, dueAt);
    assert.equal(analysis.target_at, dueAt);
  });

  it("allows 60 calls an hour and blocks the next one", () => {
    const start = new Date("2026-10-22T10:00:00Z");
    let stamps: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      const next = applyVoiceRateLimit(stamps, new Date(start.getTime() + i * 1000));
      assert.equal(next.allowed, true);
      stamps = next.kept;
    }
    const blocked = applyVoiceRateLimit(stamps, new Date(start.getTime() + 61_000));
    assert.equal(blocked.allowed, false);
    const later = applyVoiceRateLimit(stamps, new Date(start.getTime() + 60 * 60 * 1000 + 2000));
    assert.equal(later.allowed, true);
  });
});

describe("voice ingest handler", () => {
  it("creates a task only for the token user", async () => {
    const store = memoryStore();
    const response = await handleVoiceIngest(
      request({
        title: "לקנות חלב",
        due_date: "2026-10-23",
        due_time: "15:00",
        notes: "מהסופר",
        source: "voice",
        location: "רחוב הרצל",
        client_id: "pi-42",
        user_id: "attacker",
      }),
      store,
      NOW,
    );
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.task_id, "task-1");
    assert.match(body.due_at, /T15:00:00\+03:00$/);
    assert.equal(store.inserted[0]?.userId, "user-1");
    assert.match(store.inserted[0]?.content ?? "", /מיקום: רחוב הרצל/);
    assert.equal(store.inserted[0]?.metadata.source, "voice");
  });

  it("returns the same task for a repeated client_id", async () => {
    const store = memoryStore();
    const first = await handleVoiceIngest(request({ title: "חלב", client_id: "pi-42", source: "voice" }), store, NOW);
    const second = await handleVoiceIngest(request({ title: "חלב", client_id: "pi-42", source: "voice" }), store, NOW);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal((await second.json()).task_id, "task-1");
    assert.equal(store.inserted.length, 1);
  });

  it("returns 401, 400, and 429", async () => {
    const store = memoryStore();
    const unauthorized = await handleVoiceIngest(request({ title: "חלב" }, "not-a-valid-device-token-value"), store, NOW);
    assert.equal(unauthorized.status, 401);
    assert.equal((await unauthorized.json()).error.code, "unauthorized");

    const invalid = await handleVoiceIngest(request({ source: "voice" }), store, NOW);
    assert.equal(invalid.status, 400);

    for (let i = 0; i < 60; i += 1) {
      const ok = await handleVoiceIngest(request({ title: `משימה ${i}`, source: "voice" }), store, NOW);
      assert.equal(ok.status, 201);
    }
    const limited = await handleVoiceIngest(request({ title: "עוד אחת", source: "voice" }), store, NOW);
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error.code, "rate_limited");
  });
});

describe("voice ingest deploy wiring", () => {
  it("deploys with verify_jwt disabled and stores only a hash", () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const workflow = readFileSync(path.join(root, ".github/workflows/deploy-supabase-functions.yml"), "utf8");
    const config = readFileSync(path.join(root, "supabase/config.toml"), "utf8");
    const migration = readFileSync(
      path.join(root, "supabase/migrations/20261022100000_device_tokens.sql"),
      "utf8",
    );
    assert.match(workflow, /functions deploy voice-ingest[\s\S]*--import-map "\$IMPORT_MAP" --no-verify-jwt/);
    assert.match(config, /\[functions\.voice-ingest\]\s+verify_jwt = false/);
    assert.match(migration, /token_hash/);
    assert.match(migration, /enable row level security/);
    assert.match(migration, /revoke all on table public\.device_tokens from anon, authenticated/);
  });
});
