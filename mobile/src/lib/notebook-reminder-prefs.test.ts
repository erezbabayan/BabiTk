import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatReminderTime,
  notebookReminderPrefsFromRow,
  notebookReminderRowPatch,
} from "./notebook-reminder-prefs.ts";

describe("notebook reminder prefs (mobile)", () => {
  it("defaults to on at 19:00", () => {
    assert.deepEqual(notebookReminderPrefsFromRow(undefined), { enabled: true, hour: 19, minute: 0 });
  });

  it("round-trips stored values and patches", () => {
    assert.deepEqual(
      notebookReminderPrefsFromRow({ notebook_reminder_enabled: false, notebook_reminder_hour: 6, notebook_reminder_minute: 5 }),
      { enabled: false, hour: 6, minute: 5 },
    );
    assert.deepEqual(notebookReminderRowPatch({ hour: 20, minute: 15 }), {
      notebook_reminder_hour: 20,
      notebook_reminder_minute: 15,
    });
    assert.equal(formatReminderTime(9, 0), "09:00");
  });
});
