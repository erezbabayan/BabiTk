import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatReminderTime,
  notebookReminderPrefsFromRow,
  notebookReminderRowPatch,
  parseReminderTime,
} from "./notebook-reminder-prefs.ts";

describe("notebook reminder prefs", () => {
  it("defaults to on at 19:00 when the row has no values", () => {
    assert.deepEqual(notebookReminderPrefsFromRow(null), { enabled: true, hour: 19, minute: 0 });
    assert.deepEqual(notebookReminderPrefsFromRow({ notebook_reminder_hour: 99 }), {
      enabled: true,
      hour: 19,
      minute: 0,
    });
  });

  it("reads stored values", () => {
    assert.deepEqual(
      notebookReminderPrefsFromRow({
        notebook_reminder_enabled: false,
        notebook_reminder_hour: 8,
        notebook_reminder_minute: 45,
      }),
      { enabled: false, hour: 8, minute: 45 },
    );
  });

  it("maps a patch to DB columns only for provided fields", () => {
    assert.deepEqual(notebookReminderRowPatch({ enabled: false }), { notebook_reminder_enabled: false });
    assert.deepEqual(notebookReminderRowPatch({ hour: 21, minute: 30 }), {
      notebook_reminder_hour: 21,
      notebook_reminder_minute: 30,
    });
  });

  it("formats and parses HH:MM", () => {
    assert.equal(formatReminderTime(7, 5), "07:05");
    assert.deepEqual(parseReminderTime("19:00"), { hour: 19, minute: 0 });
    assert.deepEqual(parseReminderTime("7:30"), { hour: 7, minute: 30 });
    assert.equal(parseReminderTime("24:00"), null);
    assert.equal(parseReminderTime(""), null);
  });
});
