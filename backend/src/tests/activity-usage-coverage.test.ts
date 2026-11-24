import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import * as edge from "../../../supabase/functions/_shared/activity-events.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const MIGRATION = "supabase/migrations/20261124180000_activity_usage_coverage.sql";
const ROLLBACK = "supabase/rollbacks/20261124180000_activity_usage_coverage.rollback.sql";

/** Strip SQL line comments so assertions only look at executable SQL. */
function ddl(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("activity usage coverage (silent, server side)", () => {
  it("knows the new event types and they fit the table check", () => {
    for (const t of [
      "login",
      "session_refresh",
      "board_write",
      "notebook_scan",
      "voice_record",
      "voice_transcribe",
      "whatsapp_setup",
      "whatsapp_phone_otp",
      "babisnap_pairing",
      "account_action",
    ]) {
      assert.equal(edge.isActivityEventType(t), true, t);
      assert.match(t, /^[a-z][a-z0-9_]{1,39}$/);
    }
  });

  it("auth triggers are fail-open AFTER triggers that never touch the row", () => {
    const sql = ddl(read(MIGRATION));
    assert.match(sql, /after insert on auth\.sessions\s+for each row execute function public\.activity_on_auth_session\(\)/);
    assert.match(sql, /after update on auth\.sessions\s+for each row execute function public\.activity_on_auth_session\(\)/);
    assert.match(sql, /after insert on auth\.refresh_tokens\s+for each row execute function public\.activity_on_auth_refresh_token\(\)/);
    assert.doesNotMatch(sql, /before (insert|update|delete) on auth\./i);
    // No Auth Hook, no claim changes, no writes to auth tables.
    assert.doesNotMatch(sql, /custom_access_token|hook|claims/i);
    assert.doesNotMatch(sql, /(insert into|update|delete from|alter table|create (table|function|index)[^;]*) auth\./i);
    // Never modify NEW.
    assert.doesNotMatch(sql, /new\.[a-z_]+\s*:=/i);
    for (const fn of ["activity_on_auth_session", "activity_on_auth_refresh_token", "activity_on_board_write", "activity_note_tk"]) {
      const body = sql.slice(sql.indexOf(`function public.${fn}(`));
      const end = body.indexOf("$$;");
      const def = body.slice(0, end);
      assert.match(def, /security definer/, fn);
      assert.match(def, /set search_path = ''/, fn);
      assert.match(def, /exception when others then\s+(--[^\n]*\n\s*)?null;/, fn);
      assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`), fn);
    }
  });

  it("board writes count only for a signed-in user (service role / cron never)", () => {
    const sql = ddl(read(MIGRATION));
    for (const table of ["mindtasker_items", "source_materials", "user_tags"]) {
      assert.match(
        sql,
        new RegExp(`after insert or update on public\\.${table}\\s+for each statement execute function public\\.activity_on_board_write\\(\\)`),
        table,
      );
    }
    const fn = sql.slice(sql.indexOf("function public.activity_on_board_write("));
    assert.match(fn, /uid := auth\.uid\(\);\s+if uid is not null then\s+perform public\.activity_note_tk\(uid, 'board_write'\);/);
  });

  it("writes are one INSERT ... ON CONFLICT DO NOTHING into activity_events", () => {
    const sql = ddl(read(MIGRATION));
    const inserts = sql.match(/insert into public\.[a-z_]+/g) ?? [];
    assert.ok(inserts.length >= 2);
    for (const i of inserts) assert.equal(i, "insert into public.activity_events");
    assert.equal((sql.match(/on conflict on constraint activity_events_daily_key do nothing/g) ?? []).length, 2);
    assert.match(sql, /\(now\(\) at time zone 'Asia\/Jerusalem'\)::date/);
    // Metadata only.
    assert.doesNotMatch(sql, /raw_text|content|title|email|phone|storage_url/);
  });

  it("backfill uses real timestamps only, Israel day, existing users", () => {
    const sql = ddl(read(MIGRATION));
    const backfill = sql.slice(sql.indexOf("with src as ("));
    assert.match(backfill, /auth\.refresh_tokens/);
    assert.match(backfill, /join auth\.users u on u\.id::text = src\.uid/);
    assert.match(backfill, /where src\.ts is not null\s+and src\.ts <= now\(\)/);
    assert.match(backfill, /\(src\.ts at time zone 'Asia\/Jerusalem'\)::date/);
    assert.doesNotMatch(backfill, /generate_series|random\(|interval '1 day'/);
  });

  it("rollback drops every trigger and helper", () => {
    const sql = ddl(read(ROLLBACK));
    for (const t of [
      "activity_events_session_login on auth.sessions",
      "activity_events_session_refresh on auth.sessions",
      "activity_events_refresh_token on auth.refresh_tokens",
      "activity_events_board_write on public.mindtasker_items",
      "activity_events_board_write on public.source_materials",
      "activity_events_board_write on public.user_tags",
    ]) {
      assert.ok(sql.includes(`drop trigger if exists ${t};`), t);
    }
    for (const fn of ["activity_on_board_write", "activity_on_auth_refresh_token", "activity_on_auth_session", "activity_note_tk"]) {
      assert.match(sql, new RegExp(`drop function if exists public\\.${fn}\\(`), fn);
    }
  });

  it("edge hooks are fire-and-forget, after success, and leave responses as they were", () => {
    const hooks: Array<[string, RegExp]> = [
      ["supabase/functions/ingest-voice/index.ts", /itemId: payload\.itemId \|\| undefined,\n\s+\}\);\n\s+\/\/[^\n]*\n\s+noteTkActivity\(userId, "voice_record"\);\n\s+return json\(\{\n\s+ok: true,/],
      ["supabase/functions/ingest-notebook/index.ts", /fileName: payload\.fileName,\n\s+\}\);\n\s+\/\/[^\n]*\n\s+noteTkActivity\(userId, "notebook_scan"\);\n\s+return json\(\{\n\s+ok: true,/],
      ["supabase/functions/transcribe-voice-item/index.ts", /manual: true,\n\s+\}\);\n\s+noteTkActivity\(userId, "voice_transcribe"\);\n\s+return json\(\{\n\s+ok: true,/],
      ["supabase/functions/account/index.ts", /noteTkActivity\(userId, "account_action"\);\n\s+return json\(\{ ok: true \}\);/],
      ["supabase/functions/babisnap/index.ts", /if \(result\.status < 400\) noteTkActivity\(userData\.user\.id, "babisnap_pairing"\);\n\s+return json\(result\.body, result\.status\);/],
      ["supabase/functions/whatsapp-green-connect/index.ts", /const userId = userData\.user\.id;\n(\s+\/\/[^\n]*\n)+\s+noteTkActivity\(userId, "whatsapp_setup"\);/],
      ["supabase/functions/whatsapp-phone-otp/index.ts", /const userId = userData\.user\.id;\n(\s+\/\/[^\n]*\n)+\s+noteTkActivity\(userId, "whatsapp_phone_otp"\);/],
    ];
    for (const [file, re] of hooks) {
      const src = read(file);
      assert.match(src, re, file);
      assert.match(src, /import \{ noteTkActivity \} from "\.\.\/_shared\/tk-activity\.ts";/, file);
      assert.doesNotMatch(src, /await\s+noteTkActivity|noteTkActivity\([^)]*\)\s*\.then/, file);
      // Not part of any response body.
      assert.doesNotMatch(src, /json\([^)]*noteTkActivity/, file);
    }
    const helper = read("supabase/functions/_shared/tk-activity.ts");
    assert.match(helper, /export function noteTkActivity\([^)]*\): void \{\n\s+try \{/);
    assert.match(helper, /record\("tk", userId, eventType\)/);
    assert.doesNotMatch(helper, /await /);
  });

  it("BabiSnap pairing path is unchanged: voice-ingest still writes tk + device_token_use", () => {
    const voice = read("supabase/functions/voice-ingest/index.ts");
    assert.match(voice, /activity\?\.record\("tk", tokenUserId, "device_token_use"\)/);
    assert.doesNotMatch(voice, /noteTkActivity/);
    const snap = read("supabase/functions/snap-users/index.ts");
    assert.doesNotMatch(snap, /noteTkActivity|"tk"/);
  });
});
