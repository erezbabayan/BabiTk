import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  catchupLookbackMinutes,
  GROUP_CATCHUP_GRACE_SECONDS,
  markWhatsAppInboundSeen,
  runScheduledGroupCatchup,
  selectNewGroupMessages,
  type CatchupFetchers,
} from "../../../supabase/functions/_shared/whatsapp-group-catchup-cron.ts";
import type { GreenApiJournalText } from "../../../supabase/functions/_shared/green-api-chats.ts";

type Row = Record<string, unknown>;

function getPath(row: Row, col: string): unknown {
  if (col.includes("->>")) {
    const [base = "", key = ""] = col.split("->>");
    const obj = row[base] as Row | undefined;
    return obj ? obj[key] : undefined;
  }
  return row[col];
}

/** Minimal in-memory twin of the supabase-js calls the catch-up makes. */
function fakeDb(tables: Record<string, Row[]>) {
  const pk: Record<string, string[]> = { whatsapp_inbound_seen: ["user_id", "message_id"] };
  function builder(table: string) {
    const rows = (tables[table] ??= []);
    const preds: Array<(row: Row) => boolean> = [];
    let op: "select" | "update" | "insert" | "upsert" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let ignoreDup = false;
    let single = false;
    let limitN = Infinity;
    const api: Record<string, unknown> = {
      select() { return api; },
      eq(col: string, v: unknown) { preds.push((r) => getPath(r, col) === v); return api; },
      is(col: string, v: unknown) { preds.push((r) => (getPath(r, col) ?? null) === v); return api; },
      not(col: string, _op: string, _v: unknown) { preds.push((r) => getPath(r, col) != null); return api; },
      in(col: string, vs: unknown[]) { preds.push((r) => vs.includes(getPath(r, col))); return api; },
      filter(col: string, _op: string, v: unknown) { preds.push((r) => getPath(r, col) === v); return api; },
      limit(n: number) { limitN = n; return api; },
      maybeSingle() { single = true; return api; },
      update(p: Row) { op = "update"; payload = p; return api; },
      insert(p: Row | Row[]) { op = "insert"; payload = p; return api; },
      upsert(p: Row, o: { ignoreDuplicates?: boolean }) { op = "upsert"; payload = p; ignoreDup = !!o?.ignoreDuplicates; return api; },
      delete() { op = "delete"; return api; },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        const match = rows.filter((r) => preds.every((p) => p(r)));
        let data: unknown = null;
        if (op === "select") data = single ? match[0] ?? null : match.slice(0, limitN);
        if (op === "update") { for (const r of match) Object.assign(r, payload); data = match; }
        if (op === "insert") { const list = Array.isArray(payload) ? payload : [payload!]; rows.push(...list.map((r) => ({ ...r }))); data = list; }
        if (op === "upsert") {
          const row = payload as Row;
          const keys = pk[table] ?? ["id"];
          const exists = rows.some((r) => keys.every((k) => r[k] === row[k]));
          if (exists && ignoreDup) data = [];
          else { rows.push({ ...row }); data = [row]; }
        }
        if (op === "delete") { for (const r of match) rows.splice(rows.indexOf(r), 1); data = match; }
        resolve({ data, error: null });
      },
    };
    return api;
  }
  return { from: (t: string) => builder(t), tables };
}

const GROUP = "120363000000000001@g.us";
const USER = "u1";
const NOW = Date.parse("2026-10-23T15:00:00Z");
const WATERMARK = "2026-10-23T14:25:38Z";
const wmSec = Math.floor(Date.parse(WATERMARK) / 1000);

function msg(id: string, ts: number, text = "לקנות חלב", chatId = GROUP): GreenApiJournalText {
  return { messageId: id, chatId, text, timestamp: ts, chatName: "קליטה", outgoing: true };
}

function baseTables(extra: Partial<Record<string, Row[]>> = {}) {
  return {
    whatsapp_gateways: [{ user_id: USER, instance_id: "1101", api_token: "tok-tok-tok-tok", api_url: null }],
    users: [{ id: USER, phone_verified: true, whatsapp_capture_group_chat_id: GROUP, whatsapp_group_catchup_since: WATERMARK }],
    mindtasker_items: [],
    source_materials: [],
    whatsapp_inbound_seen: [],
    ...extra,
  } as Record<string, Row[]>;
}

function fetchers(rows: GreenApiJournalText[]): CatchupFetchers {
  return { journal: async () => rows, history: async () => [] };
}

describe("group catch-up: watermark (new messages only)", () => {
  it("never selects messages at/before the watermark, unknown timestamps, other chats or the grace window", () => {
    const nowSec = Math.floor(NOW / 1000);
    const rows = [
      msg("old", wmSec - 3600),
      msg("at", wmSec),
      msg("zero", 0),
      msg("other", wmSec + 60, "x", "999@g.us"),
      msg("fresh", nowSec - 30),
      msg("cmd", wmSec + 60, "בוצע"),
      msg("new", wmSec + 60),
    ];
    const out = selectNewGroupMessages(rows, { chatId: GROUP, sinceSec: wmSec, nowSec });
    assert.deepEqual(out.map((m) => m.messageId), ["new"]);
  });

  it("dry run right after the watermark imports 0 even with a week of old history", async () => {
    const db = fakeDb(baseTables());
    const history = Array.from({ length: 60 }, (_, i) => msg(`old${i}`, wmSec - 60 * (i + 1)));
    const res = await runScheduledGroupCatchup(db, fetchers(history), { dryRun: true, nowMs: Date.parse(WATERMARK) + 5_000 });
    assert.equal(res.wouldInsert, 0);
    assert.equal(res.inserted, 0);
    assert.equal(db.tables.mindtasker_items!.length, 0);
    const later = await runScheduledGroupCatchup(db, fetchers(history), { dryRun: true, nowMs: NOW });
    assert.equal(later.wouldInsert, 0);
  });

  it("a user without a watermark gets one set to now and nothing imported", async () => {
    const tables = baseTables();
    tables.users![0]!.whatsapp_group_catchup_since = null;
    const db = fakeDb(tables);
    const res = await runScheduledGroupCatchup(db, fetchers([msg("old", wmSec)]), { nowMs: NOW });
    assert.equal(res.inserted, 0);
    assert.equal(db.tables.users![0]!.whatsapp_group_catchup_since, new Date(NOW).toISOString());
  });

  it("lookback is bounded", () => {
    assert.equal(catchupLookbackMinutes(wmSec, wmSec + 600), 20);
    assert.equal(catchupLookbackMinutes(wmSec - 30 * 86400, wmSec), 48 * 60);
  });
});

describe("group catch-up: dedupe with the live webhook", () => {
  it("skips ids the webhook already captured (item, source, or ledger) and imports only missed ones once", async () => {
    const tables = baseTables({
      mindtasker_items: [{ user_id: USER, metadata: { whatsapp_message_id: "viaItem" } }],
      source_materials: [{ user_id: USER, metadata: { whatsapp_message_id: "viaSource" } }],
    });
    const db = fakeDb(tables);
    await markWhatsAppInboundSeen(db, USER, "viaLedger");
    const rows = [msg("viaItem", wmSec + 100), msg("viaSource", wmSec + 200), msg("viaLedger", wmSec + 300), msg("missed", wmSec + 400)];
    const first = await runScheduledGroupCatchup(db, fetchers(rows), { nowMs: NOW });
    assert.equal(first.inserted, 1);
    assert.equal(first.duplicates, 3);
    const second = await runScheduledGroupCatchup(db, fetchers(rows), { nowMs: NOW + 600_000 });
    assert.equal(second.inserted, 0);
    const ids = db.tables.mindtasker_items!.map((r) => (r.metadata as Row).whatsapp_message_id);
    assert.deepEqual(ids.filter((id) => id === "missed"), ["missed"]);
    assert.equal(ids.length, 2);
  });

  it("two overlapping runs insert a message once (atomic claim)", async () => {
    const db = fakeDb(baseTables());
    const rows = [msg("m1", wmSec + 100), msg("m2", wmSec + 200)];
    const [a, b] = await Promise.all([
      runScheduledGroupCatchup(db, fetchers(rows), { nowMs: NOW }),
      runScheduledGroupCatchup(db, fetchers(rows), { nowMs: NOW }),
    ]);
    assert.equal(a.inserted + b.inserted, 2);
    assert.equal(db.tables.mindtasker_items!.length, 2);
  });

  it("does not run for users without phone verification or a bound group", async () => {
    const tables = baseTables();
    tables.users![0]!.phone_verified = false;
    const res = await runScheduledGroupCatchup(fakeDb(tables), fetchers([msg("m", wmSec + 100)]), { nowMs: NOW });
    assert.equal(res.users, 0);
  });

  it("grace window keeps very recent messages for the webhook", () => {
    assert.ok(GROUP_CATCHUP_GRACE_SECONDS >= 120);
  });
});

describe("group catch-up: wiring", () => {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  it("webhook records handled ids in the background (no added latency)", () => {
    const src = readFileSync(`${root}supabase/functions/whatsapp-green-webhook/index.ts`, "utf8");
    assert.equal((src.match(/scheduleBackgroundWork\(markWhatsAppInboundSeen/g) ?? []).length, 2);
  });
  it("migrations read the token from Vault and schedule every 10 minutes", () => {
    const cron = readFileSync(`${root}supabase/migrations/20261023151000_pg_cron_group_catchup.sql`, "utf8");
    assert.match(cron, /vault\.decrypted_secrets/);
    assert.match(cron, /babitk_group_catchup_cron_secret/);
    assert.match(cron, /'2-59\/10 \* \* \* \*'/);
    assert.equal(/eyJ[A-Za-z0-9_-]{10,}/.test(cron), false);
    const wm = readFileSync(`${root}supabase/migrations/20261023150000_group_catchup_watermark.sql`, "utf8");
    assert.match(wm, /whatsapp_group_catchup_since/);
    assert.match(wm, /primary key \(user_id, message_id\)/);
  });
});
