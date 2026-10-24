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
  mapVoiceTagsToAllowed,
  sanitizeVoiceTags,
  parseVoiceIngestBody,
  voiceDueAt,
  voiceItemPlacement,
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

function memoryStore(options?: {
  revoked?: boolean;
  existing?: StoredVoiceTask;
  tagsFail?: boolean;
}): VoiceIngestStore & {
  inserted: Array<{
    userId: string;
    title: string;
    content: string;
    tags: string[];
    dueAt: string | null;
    isActionable: boolean;
    status: "inbox";
    metadata: Record<string, unknown>;
  }>;
  timestamps: string[];
} {
  const device: DeviceTokenRecord = {
    id: "token-1",
    userId: "user-1",
    revokedAt: options?.revoked ? "2026-10-01T00:00:00Z" : null,
    requestTimestamps: [],
  };
  const inserted: Array<{
    userId: string;
    title: string;
    content: string;
    tags: string[];
    dueAt: string | null;
    isActionable: boolean;
    status: "inbox";
    metadata: Record<string, unknown>;
  }> = [];
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
    async loadAllowedTagNames() {
      if (options?.tagsFail) throw new Error("db down");
      return ["משפחה", "עבודה", "מילואים", "Shopping"];
    },
    async listTags() {
      return [
        { name: "משפחה", color: "#f9a8d4" },
        { name: "מילואים", color: "#fca5a5" },
      ];
    },
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
    if (parsed.ok) {
      assert.equal(parsed.value.title, "לקנות חלב");
      assert.equal(parsed.value.itemType, "task");
      assert.equal(parsed.value.board, "default");
    }
    assert.equal(parseVoiceIngestBody({ title: "חלב", type: "idea" }).ok, false);
    assert.equal(parseVoiceIngestBody({ title: "חלב", board: "tasks" }).ok, false);
    const notebookNote = parseVoiceIngestBody({ title: "רעיון", type: "note", board: "notebook" });
    assert.equal(notebookNote.ok, true);
    if (notebookNote.ok) {
      assert.equal(notebookNote.value.itemType, "note");
      assert.equal(notebookNote.value.board, "notebook");
    }
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
    const body = (await response.json()) as { ok: boolean; task_id: string; due_at: string };
    assert.equal(body.ok, true);
    assert.equal(body.task_id, "task-1");
    assert.match(body.due_at, /T15:00:00\+03:00$/);
    assert.equal(store.inserted[0]?.userId, "user-1");
    assert.match(store.inserted[0]?.content ?? "", /מיקום: רחוב הרצל/);
    assert.equal(store.inserted[0]?.metadata.source, "voice");
    assert.equal(store.inserted[0]?.status, "inbox");
    assert.equal(store.inserted[0]?.isActionable, true);
  });

  it("keeps a notebook note on the same due and reminder path as a task", async () => {
    const store = memoryStore();
    const response = await handleVoiceIngest(
      request({
        title: "רעיון למתנה",
        type: "note",
        board: "notebook",
        due_date: "2026-10-23",
        due_time: "15:00",
        source: "voice",
      }),
      store,
      NOW,
    );
    assert.equal(response.status, 201);
    const row = store.inserted[0];
    assert.equal(row?.status, "inbox");
    assert.equal(row?.isActionable, false);
    assert.match(row?.dueAt ?? "", /T15:00:00\+03:00$/);
    assert.equal(row?.metadata.source, "voice");
    assert.equal(row?.metadata.channel, "voice");
    assert.equal(row?.metadata.reminder_manual, true);
    assert.equal(row?.metadata.reminder_sent, false);
    assert.equal(row?.metadata.reminder_disabled, false);
    const analysis = row?.metadata.analysis as { notify_at: string; target_at: string };
    assert.equal(analysis.notify_at, row?.dueAt);
    assert.equal(analysis.target_at, row?.dueAt);
    assert.deepEqual(voiceItemPlacement({ itemType: "task", board: "notebook" }), {
      status: "inbox",
      isActionable: true,
    });
    assert.deepEqual(voiceItemPlacement({ itemType: "note", board: "default" }), {
      status: "inbox",
      isActionable: false,
    });
  });

  it("returns the same task for a repeated client_id", async () => {
    const store = memoryStore();
    const first = await handleVoiceIngest(request({ title: "חלב", client_id: "pi-42", source: "voice" }), store, NOW);
    const second = await handleVoiceIngest(request({ title: "חלב", client_id: "pi-42", source: "voice" }), store, NOW);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const replay = (await second.json()) as { task_id: string };
    assert.equal(replay.task_id, "task-1");
    assert.equal(store.inserted.length, 1);
  });

  it("returns 401, 400, and 429", async () => {
    const store = memoryStore();
    const unauthorized = await handleVoiceIngest(request({ title: "חלב" }, "not-a-valid-device-token-value"), store, NOW);
    assert.equal(unauthorized.status, 401);
    const unauthorizedBody = (await unauthorized.json()) as { error: { code: string } };
    assert.equal(unauthorizedBody.error.code, "unauthorized");

    const invalid = await handleVoiceIngest(request({ source: "voice" }), store, NOW);
    assert.equal(invalid.status, 400);

    for (let i = 0; i < 60; i += 1) {
      const ok = await handleVoiceIngest(request({ title: `משימה ${i}`, source: "voice" }), store, NOW);
      assert.equal(ok.status, 201);
    }
    const limited = await handleVoiceIngest(request({ title: "עוד אחת", source: "voice" }), store, NOW);
    assert.equal(limited.status, 429);
    const limitedBody = (await limited.json()) as { error: { code: string } };
    assert.equal(limitedBody.error.code, "rate_limited");
  });
});

describe("voice ingest deploy wiring", () => {
  it("deploys with verify_jwt disabled and stores only a hash", () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const endpoint = readFileSync(path.join(root, "supabase/functions/voice-ingest/index.ts"), "utf8");
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
    assert.match(endpoint, /is_actionable: input\.isActionable/);
    assert.match(endpoint, /status: input\.status/);
  });
});

function getRequest(token = "babi_test_token_value_0123456789", method = "GET"): Request {
  return new Request("https://example.test/voice-ingest", {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe("voice ingest tags", () => {
  it("sanitizes tags: strings only, trim, dedupe, max 12, max 40 chars", () => {
    assert.deepEqual(sanitizeVoiceTags(undefined), []);
    assert.deepEqual(sanitizeVoiceTags("מילואים"), []);
    assert.deepEqual(sanitizeVoiceTags([" מילואים ", "מילואים", 5, null, "", "#עבודה", "x".repeat(41)]), [
      "מילואים",
      "עבודה",
    ]);
    const many = Array.from({ length: 20 }, (_, i) => `t${i}`);
    assert.equal(sanitizeVoiceTags(many).length, 12);
    assert.deepEqual(mapVoiceTagsToAllowed(["shopping", "לא קיים", "מילואים"], ["Shopping", "מילואים"]), [
      "Shopping",
      "מילואים",
    ]);
  });

  it("saves only the user's tags and never fails on bad tags", async () => {
    const store = memoryStore();
    const ok = await handleVoiceIngest(
      request({ title: "אימון", type: "task", tags: ["מילואים", "לא קיים", "shopping"] }),
      store,
      NOW,
    );
    assert.equal(ok.status, 201);
    assert.deepEqual(store.inserted[0]?.tags, ["מילואים", "Shopping"]);

    const bad = await handleVoiceIngest(request({ title: "חלב", tags: "oops" }), store, NOW);
    assert.equal(bad.status, 201);
    assert.deepEqual(store.inserted[1]?.tags, []);

    const failing = memoryStore({ tagsFail: true });
    const down = await handleVoiceIngest(request({ title: "חלב", type: "task", tags: ["מילואים"] }), failing, NOW);
    assert.equal(down.status, 201);
    assert.deepEqual(failing.inserted[0]?.tags, []);
  });

  it("old clients (no tags, no type) behave exactly as before", async () => {
    const store = memoryStore();
    const response = await handleVoiceIngest(request({ title: "לקנות חלב", notes: "נוצר בהכתבה: לקנות מחר חלב" }), store, NOW);
    assert.equal(response.status, 201);
    assert.deepEqual(store.inserted[0]?.tags, []);
    assert.equal(store.inserted[0]?.metadata.voice_explicit, undefined);
    assert.equal(store.inserted[0]?.metadata.context_parsed_at, undefined);
  });
});

describe("voice ingest explicit title + type", () => {
  it("keeps title and type exactly as sent and marks the item parsed", async () => {
    const store = memoryStore();
    await handleVoiceIngest(
      request({ title: "לקנות חלב", type: "task", notes: "נוצר בהכתבה: לקנות מחר חלב" }),
      store,
      NOW,
    );
    await handleVoiceIngest(
      request({ title: "קוד לשער 1234", type: "note", notes: "נוצר בהכתבה: קוד לשער 1234" }),
      store,
      NOW,
    );
    assert.equal(store.inserted[0]?.title, "לקנות חלב");
    assert.equal(store.inserted[0]?.isActionable, true);
    assert.equal(store.inserted[0]?.metadata.voice_explicit, true);
    assert.equal(store.inserted[0]?.metadata.context_parsed_at, NOW.toISOString());
    assert.equal(store.inserted[1]?.title, "קוד לשער 1234");
    assert.equal(store.inserted[1]?.isActionable, false);
    assert.equal(store.inserted[1]?.metadata.voice_explicit, true);
  });
});

describe("voice ingest GET tags", () => {
  it("returns {tags:[{name,color}]} for a valid device token", async () => {
    const store = memoryStore();
    const response = await handleVoiceIngest(getRequest(), store, NOW);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.deepEqual(await response.json(), {
      tags: [
        { name: "משפחה", color: "#f9a8d4" },
        { name: "מילואים", color: "#fca5a5" },
      ],
    });
    assert.equal(store.timestamps.length, 1);
  });

  it("rejects bad/revoked tokens and enforces the same rate limit", async () => {
    assert.equal((await handleVoiceIngest(getRequest("short"), memoryStore(), NOW)).status, 401);
    assert.equal(
      (await handleVoiceIngest(getRequest("babi_wrong_token_value_0123456789"), memoryStore(), NOW)).status,
      401,
    );
    assert.equal((await handleVoiceIngest(getRequest(), memoryStore({ revoked: true }), NOW)).status, 401);
    const store = memoryStore();
    for (let i = 0; i < 60; i += 1) {
      assert.equal((await handleVoiceIngest(getRequest(), store, NOW)).status, 200);
    }
    assert.equal((await handleVoiceIngest(getRequest(), store, NOW)).status, 429);
  });

  it("OPTIONS preflight allows GET and POST", async () => {
    const response = await handleVoiceIngest(getRequest(undefined, "OPTIONS"), memoryStore(), NOW);
    assert.equal(response.status, 204);
    assert.match(response.headers.get("Access-Control-Allow-Methods") ?? "", /GET/);
    assert.match(response.headers.get("Access-Control-Allow-Methods") ?? "", /POST/);
    assert.match(response.headers.get("Access-Control-Allow-Headers") ?? "", /authorization/);
    assert.equal((await handleVoiceIngest(getRequest(undefined, "DELETE"), memoryStore(), NOW)).status, 405);
  });
});
