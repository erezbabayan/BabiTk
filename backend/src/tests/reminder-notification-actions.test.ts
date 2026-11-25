import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildReminderActionPatch,
  buildReminderDonePatch,
  DEFAULT_NOTIFICATION_ACTION,
  REMINDER_ACTIONABLE_STATUSES,
  parseReminderAction,
  REMINDER_ACTION_DONE,
  REMINDER_ACTION_SNOOZE_HOUR,
  REMINDER_ACTION_SNOOZE_TOMORROW,
  REMINDER_CATEGORY_BUTTONS,
  REMINDER_CATEGORY_NOTE,
  REMINDER_CATEGORY_TASK,
  reminderItemIdFromContent,
  reminderItemIdFromData,
  reminderSnoozeDueAt,
  type ReminderActionItem,
} from "../../../mobile/src/lib/reminder-notification-actions.ts";
import * as serverPush from "../../../supabase/functions/_shared/expo-push.ts";
import { getZonedParts } from "../../../shared/ingest/timezone.js";
import { resolveItemNotifyAt } from "../../../supabase/functions/_shared/whatsapp-reminders.ts";

const TZ = "Asia/Jerusalem";

function task(overrides: Partial<ReminderActionItem> = {}): ReminderActionItem {
  return {
    id: "item-1",
    title: "לקנות חלב",
    content: "",
    is_actionable: true,
    status: "pending",
    due_date: "2026-11-12T05:45:00.000Z",
    metadata: {
      reminder_manual: true,
      reminder_sent: true,
      push_reminder_fire_at: "2026-11-12T07:45:00+02:00",
      whatsapp_reminder_fire_at: "2026-11-12T07:45:00+02:00",
      analysis: { notify_at: "2026-11-12T07:45:00+02:00", target_at: "2026-11-12T07:45:00+02:00" },
    },
    deleted_at: null,
    ...overrides,
  };
}

describe("reminder notification categories", () => {
  it("matches the server's categoryId values", () => {
    assert.equal(REMINDER_CATEGORY_TASK, serverPush.REMINDER_CATEGORY_TASK);
    assert.equal(REMINDER_CATEGORY_NOTE, serverPush.REMINDER_CATEGORY_NOTE);
  });

  it("tasks get done / +1h / tomorrow 09:00; notes only the snoozes", () => {
    assert.deepEqual(
      REMINDER_CATEGORY_BUTTONS[REMINDER_CATEGORY_TASK]?.map((b) => b.buttonTitle),
      ["בוצע", "עוד שעה", "מחר 09:00"],
    );
    assert.deepEqual(
      REMINDER_CATEGORY_BUTTONS[REMINDER_CATEGORY_NOTE]?.map((b) => b.buttonTitle),
      ["עוד שעה", "מחר 09:00"],
    );
    for (const id of [REMINDER_CATEGORY_TASK, REMINDER_CATEGORY_NOTE]) {
      assert.doesNotMatch(id, /[:-]/);
    }
  });

  it("every button brings the app to the foreground so the write is not cut off", () => {
    // With opensAppToForeground false the tap runs in a short-lived broadcast; the
    // backgrounded app was frozen after the read and the update never reached Supabase.
    for (const buttons of Object.values(REMINDER_CATEGORY_BUTTONS)) {
      for (const button of buttons) assert.equal(button.opensAppToForeground, true, button.identifier);
    }
  });

  it("done is a single conditional update with the board's complete patch", () => {
    const now = new Date("2026-11-25T10:23:17.000Z");
    assert.deepEqual(buildReminderDonePatch(now), {
      status: "completed",
      completed_at: now.toISOString(),
      last_interacted_at: now.toISOString(),
    });
    assert.deepEqual([...REMINDER_ACTIONABLE_STATUSES], ["inbox", "pending"]);
    assert.deepEqual(buildReminderActionPatch(task({ status: "inbox" }), "done", now), buildReminderDonePatch(now));
  });

  it("parses action ids and item ids", () => {
    assert.equal(parseReminderAction(REMINDER_ACTION_DONE), "done");
    assert.equal(parseReminderAction(REMINDER_ACTION_SNOOZE_HOUR), "hour");
    assert.equal(parseReminderAction(REMINDER_ACTION_SNOOZE_TOMORROW), "tomorrow");
    assert.equal(parseReminderAction(DEFAULT_NOTIFICATION_ACTION), "open");
    assert.equal(parseReminderAction("something_else"), null);
    assert.equal(reminderItemIdFromData({ itemId: " abc " }), "abc");
    assert.equal(reminderItemIdFromData({ taskId: "t1" }), "t1");
    assert.equal(reminderItemIdFromData({}), null);
    assert.equal(reminderItemIdFromData(null), null);
  });
});

describe("reminder item id in background task payloads", () => {
  it("reads parsed content.data (JS listener)", () => {
    assert.equal(reminderItemIdFromContent({ data: { itemId: "a1" } }), "a1");
  });

  it("reads content.dataString (raw bundle the killed-app task gets)", () => {
    // Shape of NotificationSerializer.toBundle(response) for a locally presented reminder.
    const payload = {
      actionIdentifier: REMINDER_ACTION_DONE,
      notification: {
        request: {
          identifier: "server_reminder_a1_20261125T090000",
          content: {
            title: "לקנות חלב",
            categoryIdentifier: REMINDER_CATEGORY_TASK,
            dataString: JSON.stringify({ source: "server_push", itemId: "a1", fireAt: "2026-11-25T11:00:00+02:00" }),
          },
        },
      },
    };
    assert.equal(reminderItemIdFromContent(payload.notification.request.content), "a1");
  });

  it("returns null for missing or bad data", () => {
    assert.equal(reminderItemIdFromContent({ dataString: "not json" }), null);
    assert.equal(reminderItemIdFromContent({ dataString: "{}" }), null);
    assert.equal(reminderItemIdFromContent({}), null);
    assert.equal(reminderItemIdFromContent(null), null);
  });
});

describe("reminder snooze times", () => {
  it("+1 hour is one hour from now", () => {
    const now = new Date("2026-11-12T05:46:00.000Z");
    assert.equal(Date.parse(reminderSnoozeDueAt("hour", now)), Date.parse("2026-11-12T06:46:00.000Z"));
  });

  it("tomorrow is 09:00 Israel time in winter (UTC+2)", () => {
    const due = reminderSnoozeDueAt("tomorrow", new Date("2026-11-12T21:30:00.000Z")); // 23:30 local
    assert.equal(Date.parse(due), Date.parse("2026-11-13T07:00:00.000Z"));
  });

  it("tomorrow is 09:00 Israel time in summer (UTC+3)", () => {
    const due = reminderSnoozeDueAt("tomorrow", new Date("2026-07-01T10:00:00.000Z"));
    assert.equal(Date.parse(due), Date.parse("2026-07-02T06:00:00.000Z"));
  });

  it("after midnight local, tomorrow means the next local day", () => {
    // 00:30 on 13 Nov local is 22:30Z on 12 Nov.
    const due = reminderSnoozeDueAt("tomorrow", new Date("2026-11-12T22:30:00.000Z"));
    assert.equal(Date.parse(due), Date.parse("2026-11-14T07:00:00.000Z"));
  });

  it("across the spring-forward and fall-back nights it stays 09:00 local", () => {
    // Israel DST 2026: starts Fri 27 Mar, ends Sun 25 Oct.
    for (const nowIso of ["2026-03-26T20:00:00.000Z", "2026-10-24T20:00:00.000Z"]) {
      const parts = getZonedParts(new Date(reminderSnoozeDueAt("tomorrow", new Date(nowIso))), TZ);
      assert.equal(parts.hour, 9);
      assert.equal(parts.minute, 0);
    }
    const spring = reminderSnoozeDueAt("tomorrow", new Date("2026-03-26T20:00:00.000Z"));
    assert.equal(Date.parse(spring), Date.parse("2026-03-27T06:00:00.000Z"));
    const fall = reminderSnoozeDueAt("tomorrow", new Date("2026-10-24T20:00:00.000Z"));
    assert.equal(Date.parse(fall), Date.parse("2026-10-25T07:00:00.000Z"));
  });
});

describe("reminder action patches", () => {
  const now = new Date("2026-11-12T05:50:00.000Z");

  it("done completes the task like the board's completeTask", () => {
    assert.deepEqual(buildReminderActionPatch(task(), "done", now), {
      status: "completed",
      completed_at: now.toISOString(),
      last_interacted_at: now.toISOString(),
    });
  });

  it("done is a no-op for notes, completed, archived or deleted items", () => {
    assert.equal(buildReminderActionPatch(task({ is_actionable: false }), "done", now), null);
    assert.equal(buildReminderActionPatch(task({ status: "completed" }), "done", now), null);
    assert.equal(buildReminderActionPatch(task({ status: "snoozed_archive" }), "hour", now), null);
    assert.equal(
      buildReminderActionPatch(task({ deleted_at: "2026-11-12T05:00:00.000Z" }), "tomorrow", now),
      null,
    );
  });

  it("snooze re-arms the reminder so the cron fires push and WhatsApp again", () => {
    const patch = buildReminderActionPatch(task(), "hour", now);
    assert.ok(patch);
    assert.equal(Date.parse(patch.due_date ?? ""), Date.parse("2026-11-12T06:50:00.000Z"));
    const metadata = patch.metadata ?? {};
    assert.equal(metadata.reminder_sent, false);
    assert.equal(metadata.reminder_manual, true);
    const notifyAt = resolveItemNotifyAt({ is_actionable: true, due_date: patch.due_date, metadata });
    assert.ok(notifyAt);
    assert.equal(Date.parse(notifyAt), Date.parse("2026-11-12T06:50:00.000Z"));
    assert.notEqual(notifyAt, metadata.push_reminder_fire_at);
    assert.notEqual(notifyAt, metadata.whatsapp_reminder_fire_at);
    assert.ok(serverPush.shouldSendItemPush(metadata, notifyAt));
  });

  it("snooze keeps a recurring reminder's recurrence (same as the in-app popup)", () => {
    const base = task();
    const patch = buildReminderActionPatch(
      task({ metadata: { ...(base.metadata as object), reminder_recurrence: "daily" } }),
      "tomorrow",
      now,
    );
    assert.equal(patch?.metadata?.reminder_recurrence, "daily");
    assert.equal(Date.parse(patch?.due_date ?? ""), Date.parse("2026-11-13T07:00:00.000Z"));
  });

  it("notes can be snoozed too", () => {
    const patch = buildReminderActionPatch(task({ is_actionable: false }), "tomorrow", now);
    assert.ok(patch?.due_date);
    assert.equal(patch?.metadata?.reminder_sent, false);
  });
});
