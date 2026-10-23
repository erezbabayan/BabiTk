import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  acquireCronLease,
  releaseCronLease,
  withCronLease,
  type LeaseAdmin,
} from "../../../supabase/functions/_shared/cron-lease.ts";
import {
  isNotebookReminderDue,
  normalizeNotebookReminderPrefs,
  notebookReminderDateKey,
} from "../../../supabase/functions/_shared/notebook-reminder.ts";

/** In-memory twin of public.try_acquire_cron_lease / release_cron_lease. */
function fakeLeaseDb(clock: { now: number }) {
  const rows = new Map<string, { holder: string; expiresAt: number }>();
  let seq = 0;
  const admin: LeaseAdmin = {
    async rpc(fn, args) {
      const name = String(args.p_name);
      if (fn === "try_acquire_cron_lease") {
        const current = rows.get(name);
        if (current && current.expiresAt > clock.now) return { data: null, error: null };
        const holder = `h${++seq}`;
        rows.set(name, { holder, expiresAt: clock.now + Number(args.p_ttl_seconds) * 1000 });
        return { data: holder, error: null };
      }
      if (fn === "release_cron_lease") {
        if (rows.get(name)?.holder === args.p_holder) rows.delete(name);
        return { data: null, error: null };
      }
      return { data: null, error: { message: "unknown" } };
    },
  };
  return { admin, rows };
}

describe("cron single-flight lease", () => {
  it("lets one run in, blocks an overlapping run, frees on release", async () => {
    const clock = { now: 0 };
    const { admin } = fakeLeaseDb(clock);
    const a = await acquireCronLease(admin, "r", 240);
    assert.equal(a.status, "acquired");
    assert.equal((await acquireCronLease(admin, "r", 240)).status, "busy");
    await releaseCronLease(admin, "r", a);
    assert.equal((await acquireCronLease(admin, "r", 240)).status, "acquired");
  });

  it("expires a stuck lease after the TTL", async () => {
    const clock = { now: 0 };
    const { admin } = fakeLeaseDb(clock);
    await acquireCronLease(admin, "r", 240);
    clock.now = 239_000;
    assert.equal((await acquireCronLease(admin, "r", 240)).status, "busy");
    clock.now = 240_000;
    assert.equal((await acquireCronLease(admin, "r", 240)).status, "acquired");
  });

  it("concurrent ticks: only one runs the work (no double send)", async () => {
    const clock = { now: 0 };
    const { admin } = fakeLeaseDb(clock);
    let sends = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const work = async () => {
      sends += 1;
      await gate;
      return "ran";
    };
    const first = withCronLease(admin, "r", 240, work, () => "busy");
    const second = await withCronLease(admin, "r", 240, work, () => "busy");
    release();
    assert.equal(await first, "ran");
    assert.equal(second, "busy");
    assert.equal(sends, 1);
    // Lease released after the run: the next tick works.
    assert.equal(await withCronLease(admin, "r", 240, async () => "ran", () => "busy"), "ran");
  });

  it("releases the lease even when the run throws", async () => {
    const { admin, rows } = fakeLeaseDb({ now: 0 });
    await assert.rejects(withCronLease(admin, "r", 240, async () => { throw new Error("boom"); }, () => "busy"));
    assert.equal(rows.size, 0);
  });

  it("fails open when the RPC is missing (pre-migration behaviour)", async () => {
    const broken: LeaseAdmin = {
      async rpc() {
        return { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
      },
    };
    assert.equal((await acquireCronLease(broken, "r", 240)).status, "unavailable");
    assert.equal(await withCronLease(broken, "r", 240, async () => "ran", () => "busy"), "ran");
    const throwing: LeaseAdmin = { rpc: () => Promise.reject(new Error("network")) };
    assert.equal(await withCronLease(throwing, "r", 240, async () => "ran", () => "busy"), "ran");
  });
});

describe("notebook reminder on the 5-minute pg_cron cadence", () => {
  /** Simulate ticks every 5 minutes; mark sent when due (as the claim does). */
  function simulate(hour: number, minute: number, startLocal: string, endLocal: string, day = "2026-10-22") {
    const prefs = normalizeNotebookReminderPrefs({
      notebook_reminder_enabled: true,
      notebook_reminder_hour: hour,
      notebook_reminder_minute: minute,
    });
    const start = new Date(`${day}T${startLocal}:00+03:00`).getTime();
    const end = new Date(`${day}T${endLocal}:00+03:00`).getTime();
    let lastSentOn: string | null = null;
    const fired: string[] = [];
    for (let t = start; t <= end; t += 5 * 60_000) {
      const now = new Date(t);
      if (isNotebookReminderDue(now, prefs, lastSentOn)) {
        lastSentOn = notebookReminderDateKey(now);
        fired.push(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }).format(now));
      }
    }
    return fired;
  }

  it("default 19:00 fires exactly once, on the 19:00 tick", () => {
    assert.deepEqual(simulate(19, 0, "00:00", "23:55"), ["19:00"]);
  });

  it("an off-grid time fires on the next tick", () => {
    assert.deepEqual(simulate(19, 3, "00:00", "23:55"), ["19:05"]);
  });

  it("a missed tick still catches up once", () => {
    // Ticks only start at 20:40 (e.g. an outage): one late send, no repeats.
    assert.deepEqual(simulate(19, 0, "20:40", "23:55"), ["20:40"]);
  });
});

describe("pg_cron migration", () => {
  const sql = readFileSync(
    fileURLToPath(new URL("../../../supabase/migrations/20261023140000_pg_cron_reminders.sql", import.meta.url)),
    "utf8",
  );

  it("reads the token from Vault and stores no secret", () => {
    assert.match(sql, /vault\.decrypted_secrets/);
    assert.match(sql, /'babitk_reminder_cron_secret'/);
    assert.doesNotMatch(sql, /eyJ[A-Za-z0-9_-]{10,}/, "no JWT literal");
    assert.doesNotMatch(sql, /Bearer [A-Za-z0-9]/, "no inline bearer token");
    assert.doesNotMatch(sql, /sb_secret_|service_role_key/i);
  });

  it("schedules the dispatcher every 5 minutes, idempotently", () => {
    assert.match(sql, /cron\.schedule\(\s*'babitk-whatsapp-reminders',\s*'\*\/5 \* \* \* \*'/);
    assert.match(sql, /cron\.unschedule/);
    assert.match(sql, /create extension if not exists pg_cron/);
    assert.match(sql, /create extension if not exists pg_net/);
  });

  it("locks the lease and invoker functions to the service role", () => {
    assert.match(sql, /revoke all on function public\.try_acquire_cron_lease\(text, integer\) from public, anon, authenticated/);
    assert.match(sql, /revoke all on function public\.invoke_whatsapp_reminders_cron\(\) from public, anon, authenticated/);
    assert.match(sql, /grant execute on function public\.try_acquire_cron_lease\(text, integer\) to service_role/);
  });
});
