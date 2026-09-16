import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isCronReminderDue,
  reminderDueQueryCutoffIso,
  resolveCronReminderFireAt,
} from "../lib/task-reminder-due.js";

const NOW = Date.parse("2026-09-16T12:00:00.000Z");

describe("task reminder due window", () => {
  it("uses Date.parse so timezone offsets compare correctly", () => {
    const item = {
      is_actionable: true,
      due_date: "2026-09-16T15:00:00+03:00",
      metadata: null,
    };
    assert.equal(isCronReminderDue(item, NOW), true);
    assert.equal(
      isCronReminderDue(item, Date.parse("2026-09-16T11:59:00.000Z")),
      false,
    );
  });

  it("does not treat future ISO strings as due via lexicographic compare", () => {
    const item = {
      is_actionable: true,
      due_date: "2026-09-16T16:00:00+03:00",
      metadata: null,
    };
    // 16:00 +03 = 13:00Z, after NOW 12:00Z. String compare vs "...Z" would be wrong.
    assert.equal(isCronReminderDue(item, NOW), false);
  });

  it("skips already-sent and disabled reminders", () => {
    assert.equal(
      resolveCronReminderFireAt({
        is_actionable: true,
        due_date: "2026-09-16T11:00:00.000Z",
        metadata: { reminder_sent: true },
      }),
      null,
    );
    assert.equal(
      resolveCronReminderFireAt({
        is_actionable: true,
        due_date: "2026-09-16T11:00:00.000Z",
        metadata: { reminder_disabled: true },
      }),
      null,
    );
  });

  it("ignores notes unless a manual reminder is set", () => {
    assert.equal(
      resolveCronReminderFireAt({
        is_actionable: false,
        due_date: "2026-09-16T11:00:00.000Z",
        metadata: null,
      }),
      null,
    );
    assert.equal(
      resolveCronReminderFireAt({
        is_actionable: false,
        due_date: "2026-09-16T11:00:00.000Z",
        metadata: { reminder_manual: true },
      }),
      "2026-09-16T11:00:00.000Z",
    );
  });

  it("drops reminders older than 24 hours", () => {
    const item = {
      is_actionable: true,
      due_date: "2026-09-15T11:00:00.000Z",
      metadata: null,
    };
    assert.equal(isCronReminderDue(item, NOW), false);
  });

  it("lookahead cutoff is one hour ahead of now", () => {
    assert.equal(
      reminderDueQueryCutoffIso(NOW),
      "2026-09-16T13:00:00.000Z",
    );
  });
});
