import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildNotebookReminderMessage,
  isNotebookReminderDue,
  normalizeNotebookReminderPrefs,
  notebookReminderDateKey,
  parseNotebookReminderTime,
} from "../../../supabase/functions/_shared/notebook-reminder.ts";
import { dispatchNotebookReminders } from "../../../supabase/functions/_shared/notebook-reminder-dispatch.ts";

/** 2026-10-22 is a Thursday (no Shabbat); Jerusalem is UTC+3 in October 2026. */
const at = (localHHMM: string, day = "2026-10-22") => new Date(`${day}T${localHHMM}:00+03:00`);
const defaults = normalizeNotebookReminderPrefs(null);

describe("notebook reminder prefs", () => {
  it("defaults to enabled at 19:00", () => {
    assert.deepEqual(defaults, { enabled: true, hour: 19, minute: 0 });
    assert.deepEqual(
      normalizeNotebookReminderPrefs({ notebook_reminder_enabled: false, notebook_reminder_hour: 8, notebook_reminder_minute: 15 }),
      { enabled: false, hour: 8, minute: 15 },
    );
    assert.equal(normalizeNotebookReminderPrefs({ notebook_reminder_hour: 30 }).hour, 19);
    assert.deepEqual(parseNotebookReminderTime("21:30"), { hour: 21, minute: 30 });
    assert.equal(parseNotebookReminderTime("25:00"), null);
  });
});

describe("isNotebookReminderDue", () => {
  it("is due at/after the chosen time within the catch-up window, same local day", () => {
    assert.equal(isNotebookReminderDue(at("18:59"), defaults, null), false);
    assert.equal(isNotebookReminderDue(at("19:00"), defaults, null), true);
    assert.equal(isNotebookReminderDue(at("22:40"), defaults, null), true);
    assert.equal(isNotebookReminderDue(at("23:01"), defaults, null), false);
  });

  it("uses the Jerusalem date, not UTC", () => {
    assert.equal(notebookReminderDateKey(new Date("2026-10-22T22:30:00Z")), "2026-10-23");
    const late = { enabled: true, hour: 0, minute: 30 };
    assert.equal(isNotebookReminderDue(new Date("2026-10-22T21:45:00Z"), late, "2026-10-22"), true);
  });

  it("never twice on the same day and never when disabled", () => {
    assert.equal(isNotebookReminderDue(at("19:30"), defaults, "2026-10-22"), false);
    assert.equal(isNotebookReminderDue(at("19:30"), defaults, "2026-10-21"), true);
    assert.equal(isNotebookReminderDue(at("19:30"), { ...defaults, enabled: false }, null), false);
  });
});

describe("buildNotebookReminderMessage", () => {
  it("returns null for an empty notebook", () => {
    assert.equal(buildNotebookReminderMessage(0, ["x"]), null);
  });

  it("counts, lists up to 3 short titles and links to the app", () => {
    const message = buildNotebookReminderMessage(5, ["לקנות חלב", "  להתקשר   לדני ", "x".repeat(80), "רביעי"])!;
    const lines = message.split("\n");
    assert.equal(lines[0], "📒 יש לך 5 פריטים במחברת שמחכים לטיפול");
    assert.equal(lines[1], "• לקנות חלב");
    assert.equal(lines[2], "• להתקשר לדני");
    assert.ok(lines[3]!.endsWith("…") && lines[3]!.length <= 42);
    assert.equal(lines[4], "ועוד 2…");
    assert.equal(lines.at(-1), "לפתיחת המחברת: https://erezbabayan.github.io/BabiTk/");
  });

  it("uses singular wording for one item", () => {
    assert.ok(buildNotebookReminderMessage(1, ["a"])!.startsWith("📒 יש לך פריט אחד במחברת שמחכה לטיפול"));
  });
});

type UserRow = Record<string, unknown> & { id: string };

/** Minimal PostgREST-like fake covering the calls the dispatcher makes. */
function fakeAdmin(users: UserRow[], items: Array<{ user_id: string; title: string; status: string; deleted_at: string | null }>) {
  return {
    from(table: string) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      let patch: Record<string, unknown> | null = null;
      let limit = Infinity;
      let wantCount = false;
      const rows = () => (table === "users" ? users : items) as Array<Record<string, unknown>>;
      const run = () => {
        const matched = rows().filter((row) => filters.every((f) => f(row)));
        if (patch) {
          for (const row of matched) Object.assign(row, patch);
          return { data: matched.map((row) => ({ id: row.id })), error: null };
        }
        return { data: matched.slice(0, limit), count: wantCount ? matched.length : null, error: null };
      };
      const builder: any = {
        select(_cols: string, opts?: { count?: string }) {
          wantCount = opts?.count === "exact";
          return builder;
        },
        update(values: Record<string, unknown>) {
          patch = values;
          return builder;
        },
        eq(col: string, value: unknown) {
          filters.push((row) => row[col] === value);
          return builder;
        },
        is(col: string, value: unknown) {
          filters.push((row) => (row[col] ?? null) === value);
          return builder;
        },
        order() {
          return builder;
        },
        limit(n: number) {
          limit = n;
          return builder;
        },
        then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
          try {
            resolve(run());
          } catch (error) {
            reject(error);
          }
        },
      };
      return builder;
    },
  };
}

const groupUser = (id: string, extra: Record<string, unknown> = {}): UserRow => ({
  id,
  whatsapp_capture_group_chat_id: "120363000000000000@g.us",
  notebook_reminder_enabled: true,
  notebook_reminder_hour: 19,
  notebook_reminder_minute: 0,
  notebook_reminder_last_sent_on: null,
  ...extra,
});

describe("dispatchNotebookReminders", () => {
  const options = { enabled: true, shabbatQuiet: false };

  it("sends once per day, skips empty notebooks and users without a destination", async () => {
    const users = [groupUser("a"), groupUser("empty"), { ...groupUser("nodest"), whatsapp_capture_group_chat_id: null }];
    const items = [
      { user_id: "a", title: "one", status: "inbox", deleted_at: null },
      { user_id: "a", title: "two", status: "inbox", deleted_at: null },
      { user_id: "a", title: "deleted", status: "inbox", deleted_at: "2026-10-01" },
      { user_id: "a", title: "task", status: "pending", deleted_at: null },
      { user_id: "nodest", title: "x", status: "inbox", deleted_at: null },
    ];
    const admin = fakeAdmin(users, items);
    const sent: Array<[string, string]> = [];
    const deliver = async (userId: string, message: string) => {
      sent.push([userId, message]);
      return true;
    };
    const first = await dispatchNotebookReminders(admin, deliver, at("19:20"), options);
    assert.equal(first.notebookReminders, 1);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]![0], "a");
    assert.ok(sent[0]![1].startsWith("📒 יש לך 2 פריטים במחברת שמחכים לטיפול"));
    assert.equal(users[0]!.notebook_reminder_last_sent_on, "2026-10-22");

    const again = await dispatchNotebookReminders(admin, deliver, at("20:05"), options);
    assert.equal(again.notebookReminders, 0);
    assert.equal(sent.length, 1);
  });

  it("releases the day claim when delivery fails so a later tick can retry", async () => {
    const users = [groupUser("a")];
    const admin = fakeAdmin(users, [{ user_id: "a", title: "one", status: "inbox", deleted_at: null }]);
    const failed = await dispatchNotebookReminders(admin, async () => false, at("19:05"), options);
    assert.equal(failed.notebookReminders, 0);
    assert.equal(users[0]!.notebook_reminder_last_sent_on, null);
    const retried = await dispatchNotebookReminders(admin, async () => true, at("19:20"), options);
    assert.equal(retried.notebookReminders, 1);
  });

  it("respects Shabbat quiet, the env kill switch and dry runs", async () => {
    const users = [groupUser("a"), groupUser("optout", { whatsapp_shabbat_mode_enabled: false })];
    const items = [
      { user_id: "a", title: "one", status: "inbox", deleted_at: null },
      { user_id: "optout", title: "one", status: "inbox", deleted_at: null },
    ];
    const sent: string[] = [];
    const deliver = async (userId: string) => {
      sent.push(userId);
      return true;
    };
    const off = await dispatchNotebookReminders(fakeAdmin(users, items), deliver, at("19:10"), { ...options, enabled: false });
    assert.equal(off.notebookReminders, 0);
    const dry = await dispatchNotebookReminders(fakeAdmin(users, items), deliver, at("19:10"), { ...options, dryRun: true });
    assert.equal(dry.previews.length, 2);
    assert.equal(sent.length, 0);
    assert.equal(users[0]!.notebook_reminder_last_sent_on, null);
    const quiet = await dispatchNotebookReminders(fakeAdmin(users, items), deliver, at("19:10"), { ...options, shabbatQuiet: true });
    assert.equal(quiet.notebookReminders, 1);
    assert.deepEqual(sent, ["optout"]);
  });
});
