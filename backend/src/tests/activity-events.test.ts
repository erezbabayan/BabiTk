import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import * as edge from "../../../supabase/functions/_shared/activity-events.ts";
import * as node from "../lib/activity-events.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

type Row = edge.ActivityRow;

function harness(impl: typeof edge, opts: Partial<edge.ActivityRecorderOptions> = {}) {
  const rows: Row[] = [];
  const tasks: Promise<unknown>[] = [];
  const errors: unknown[] = [];
  let now = new Date("2026-11-24T10:00:00Z");
  const recorder = impl.createActivityRecorder({
    write: async (row) => void rows.push(row),
    now: () => now,
    schedule: (t) => void tasks.push(t),
    onError: (e) => void errors.push(e),
    ...opts,
  });
  return {
    rows,
    errors,
    recorder,
    setNow: (d: string) => (now = new Date(d)),
    flush: async () => {
      while (tasks.length) await tasks.shift();
    },
  };
}

for (const [label, impl] of [["edge", edge], ["backend copy", node]] as const) {
  describe(`activity-events recorder (${label})`, () => {
    it("writes one lean row and dedups per user + event + Israel day", async () => {
      const h = harness(impl as typeof edge);
      assert.equal(h.recorder.record("tk", U1, "api_request"), true);
      assert.equal(h.recorder.record("tk", U1, "api_request"), false);
      assert.equal(h.recorder.record("tk", U1.toUpperCase(), "api_request"), false);
      assert.equal(h.recorder.record("tk", U1, "whatsapp_message"), true);
      assert.equal(h.recorder.record("tk", U2, "api_request"), true);
      assert.equal(h.recorder.record("snap", U1, "api_request"), true);
      await h.flush();
      assert.equal(h.rows.length, 4);
      assert.deepEqual(Object.keys(h.rows[0]!).sort(), ["day", "event_type", "occurred_at", "system", "user_id"]);
      assert.deepEqual(h.rows[0], {
        system: "tk",
        user_id: U1,
        event_type: "api_request",
        day: "2026-11-24",
        occurred_at: "2026-11-24T10:00:00.000Z",
      });
    });

    it("uses the Asia/Jerusalem day boundary", async () => {
      const h = harness(impl as typeof edge);
      h.setNow("2026-11-24T21:59:00Z"); // 23:59 Israel
      h.recorder.record("tk", U1, "api_request");
      h.setNow("2026-11-24T22:01:00Z"); // 00:01 next day Israel
      h.recorder.record("tk", U1, "api_request");
      await h.flush();
      assert.deepEqual(h.rows.map((r) => r.day), ["2026-11-24", "2026-11-25"]);
      assert.equal(impl.activityDay(new Date("2026-07-01T21:30:00Z")), "2026-07-02"); // IDT +3
    });

    it("a failing or throwing write never throws to the caller and is retried later", async () => {
      let fail = true;
      const h = harness(impl as typeof edge, {
        write: async () => {
          if (fail) throw new Error("db down");
        },
      });
      assert.doesNotThrow(() => h.recorder.record("tk", U1, "api_request"));
      await h.flush();
      assert.equal(h.errors.length, 1);
      fail = false;
      assert.equal(h.recorder.record("tk", U1, "api_request"), true, "retry after failure");
      await h.flush();
      assert.equal(h.errors.length, 1);
    });

    it("sync throws from write/schedule/now/onError are swallowed", () => {
      const bad = impl.createActivityRecorder({
        write: () => {
          throw new Error("sync");
        },
        schedule: () => {
          throw new Error("schedule");
        },
        onError: () => {
          throw new Error("onError");
        },
      });
      assert.doesNotThrow(() => bad.record("tk", U1, "api_request"));
      const badNow = impl.createActivityRecorder({
        write: async () => {},
        now: () => {
          throw new Error("clock");
        },
      });
      assert.equal(badNow.record("tk", U1, "api_request"), false);
      assert.equal(badNow.recordLazy("snap", "k", "snap_signin", async () => U1), false);
    });

    it("record() returns before the write finishes (never awaited)", async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      let wrote = false;
      const h = harness(impl as typeof edge, {
        write: async () => {
          await gate;
          wrote = true;
        },
      });
      const t0 = Date.now();
      h.recorder.record("tk", U1, "api_request");
      assert.ok(Date.now() - t0 < 50);
      assert.equal(wrote, false);
      release();
      await h.flush();
      assert.equal(wrote, true);
    });

    it("aborts a hung write after the timeout", async () => {
      const h = harness(impl as typeof edge, {
        timeoutMs: 20,
        write: (_row, signal) =>
          new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
      });
      h.recorder.record("tk", U1, "api_request");
      // The recorder's abort timer is unref'd on purpose (telemetry must never keep
      // a Node process alive). Hold a ref'd handle so the test runner's event loop
      // stays up until the abort fires; without it Node 22 cancels the test.
      const keepAlive = setTimeout(() => {}, 5_000);
      try {
        await h.flush();
      } finally {
        clearTimeout(keepAlive);
      }
      assert.equal(h.errors.length, 1);
    });

    it("rejects bad ids and event types without writing", async () => {
      const h = harness(impl as typeof edge);
      for (const id of ["", "x", "demo", "user@example.com", undefined as unknown as string]) {
        assert.equal(h.recorder.record("tk", id, "api_request"), false);
      }
      assert.equal(h.recorder.record("tk", U1, "message_text" as edge.ActivityEventType), false);
      assert.equal(h.recorder.record("web" as edge.ActivitySystem, U1, "api_request"), false);
      await h.flush();
      assert.equal(h.rows.length, 0);
    });

    it("recordLazy resolves the id in the background and dedups on the in-memory key", async () => {
      const h = harness(impl as typeof edge);
      let lookups = 0;
      const resolve = async () => {
        lookups += 1;
        return U2;
      };
      assert.equal(h.recorder.recordLazy("snap", "a@b.com\u0000i1", "snap_heartbeat", resolve), true);
      assert.equal(h.recorder.recordLazy("snap", "a@b.com\u0000i1", "snap_heartbeat", resolve), false);
      assert.equal(h.recorder.recordLazy("snap", "a@b.com\u0000i1", "snap_signin", async () => null), true);
      await h.flush();
      assert.equal(lookups, 1);
      assert.equal(h.rows.length, 1, "unknown id -> no row");
      assert.equal(h.rows[0]!.user_id, U2);
      assert.doesNotMatch(JSON.stringify(h.rows), /a@b\.com|i1/);
    });

    it("bounded dedup cache evicts the oldest key", async () => {
      const h = harness(impl as typeof edge, { maxKeys: 1 });
      h.recorder.record("tk", U1, "api_request");
      h.recorder.record("tk", U2, "api_request");
      assert.equal(h.recorder.record("tk", U1, "api_request"), true);
      await h.flush();
      assert.equal(h.rows.length, 3);
    });

    it("supabase writer uses ON CONFLICT DO NOTHING on the daily key", async () => {
      const calls: unknown[] = [];
      const db = {
        from(table: string) {
          return {
            upsert(row: unknown, opts: unknown) {
              calls.push({ table, row, opts });
              return { abortSignal: async () => ({ error: null }) };
            },
          };
        },
      };
      await impl.supabaseActivityWrite(db as never)(
        { system: "tk", user_id: U1, event_type: "api_request", day: "2026-11-24", occurred_at: "x" },
        new AbortController().signal,
      );
      assert.deepEqual((calls[0] as { opts: unknown }).opts, {
        onConflict: "system,user_id,event_type,day",
        ignoreDuplicates: true,
      });
      assert.equal((calls[0] as { table: string }).table, "activity_events");
    });
  });
}

describe("activity_events wiring", () => {
  it("backend copy matches the edge module", () => {
    const edgeSrc = read("supabase/functions/_shared/activity-events.ts");
    const nodeSrc = read("backend/src/lib/activity-events.ts").split("\n").slice(2).join("\n");
    assert.equal(nodeSrc, edgeSrc);
  });

  it("migration: lean table, daily unique key, RLS on, no client access", () => {
    const sql = read("supabase/migrations/20261124120000_activity_events.sql");
    const ddl = sql.replace(/--.*$/gm, "");
    assert.match(ddl, /create table if not exists public\.activity_events/);
    assert.match(ddl, /unique \(system, user_id, event_type, day\)/);
    assert.match(ddl, /enable row level security/);
    assert.match(ddl, /revoke all on table public\.activity_events from public, anon, authenticated/);
    assert.doesNotMatch(ddl, /create policy|grant [a-z, ]+ to (anon|authenticated)/i);
    assert.doesNotMatch(ddl, /email|phone|content|text_body|recording|token/i);
    assert.doesNotMatch(ddl, /usage_events|alter table public\.(?!activity_events)/);
  });

  it("every hook is fire-and-forget (never awaited) and after auth", () => {
    const hooks: Array<[string, RegExp]> = [
      ["backend/src/middleware/auth.ts", /request\.user = \{\s+id: data\.user\.id,[\s\S]*?\};\s+\/\/[^\n]*\n\s+noteBackendActivity\(data\.user\.id, "api_request"\);\n\}/],
      ["backend/src/middleware/sync-auth.ts", /request\.user = \{ id: SYNC_USER_ID[^\n]*\n\s+\/\/[^\n]*\n\s+noteBackendActivity\(SYNC_USER_ID, "sync_request"\);\n\}/],
      ["supabase/functions/whatsapp-green-webhook/index.ts", /if \(!gate\.allowed\) \{[\s\S]*?continue;\n\s+\}\n\s+noteWhatsAppActivity\(user\.id\);/],
      ["supabase/functions/google-calendar/index.ts", /const user = await requireUser\(req\);\n\s+const userId = user\.id;\n\s+noteCalendarActivity\(userId\);/],
      ["supabase/functions/voice-ingest/index.ts", /if \(error\) throw new Error\(error\.message\);\n\s+noteTokenUse\(\);/],
      ["supabase/functions/snap-users/index.ts", /onActivity\(event, email, installId\) \{/],
    ];
    for (const [file, re] of hooks) {
      const src = read(file);
      assert.match(src, re, file);
      assert.doesNotMatch(src, /await\s+(noteBackendActivity|noteWhatsAppActivity|noteCalendarActivity|noteTokenUse|activity\??\.record)/, file);
    }
    const snapShared = read("supabase/functions/_shared/snap-users.ts");
    assert.match(snapShared, /await deps\.store\.upsert\(row\);\n\s+if \(deps\.onActivity\) \{\n\s+try \{/);
  });
});
