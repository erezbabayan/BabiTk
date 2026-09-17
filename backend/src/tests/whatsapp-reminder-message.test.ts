import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildWhatsAppReminderMessage,
  resolveGreenApiChatId,
  resolveItemNotifyAt,
  resolveReminderDestination,
  stampWhatsAppReminderFireAt,
  whatsappReminderFireStamp,
} from "../lib/whatsapp-reminder-message.js";
import { patchAfterReminderSent } from "../../../supabase/functions/_shared/whatsapp-reminders.ts";
import { sendViaUserGreenApi } from "../services/whatsapp/user-gateway-send.js";

describe("WhatsApp group reminder destination", () => {
  it("sends to the configured group when the setting is on", () => {
    assert.deepEqual(
      resolveReminderDestination({
        notify_whatsapp_group: true,
        whatsapp_capture_group_chat_id: "120363000000000001@g.us",
        phone: "+972501234567",
        phone_verified: true,
      }),
      { kind: "group", chatId: "120363000000000001@g.us" },
    );
  });

  it("sends to the configured group even when the leftover default flag is off", () => {
    assert.deepEqual(
      resolveReminderDestination({
        notify_whatsapp_group: false,
        whatsapp_capture_group_chat_id: "120363000000000001@g.us",
        phone: "+972501234567",
        phone_verified: true,
      }),
      { kind: "group", chatId: "120363000000000001@g.us" },
    );
  });

  it("sends nowhere without a group or verified phone", () => {
    assert.deepEqual(
      resolveReminderDestination({
        notify_whatsapp_group: true,
        whatsapp_capture_group_chat_id: null,
        phone: null,
        phone_verified: false,
      }),
      { kind: "none" },
    );
  });

  it("does not treat a personal chat as the capture group", () => {
    assert.deepEqual(
      resolveReminderDestination({
        notify_whatsapp_group: true,
        whatsapp_capture_group_chat_id: "972501234567@c.us",
        phone: "+972501234567",
        phone_verified: true,
      }),
      { kind: "phone", phone: "+972501234567" },
    );
  });
});

describe("WhatsApp reminder copy", () => {
  it("builds a Hebrew group reminder", () => {
    const message = buildWhatsAppReminderMessage("לקנות חלב", "2026-09-17T09:00:00+03:00", "task");
    assert.match(message, /תזכורת משימה/);
    assert.match(message, /לקנות חלב/);
    assert.match(message, /מועד:/);
  });

  it("keeps group chat ids intact", () => {
    assert.equal(resolveGreenApiChatId("120363@g.us"), "120363@g.us");
    assert.equal(resolveGreenApiChatId("+972501234567"), "972501234567@c.us");
  });
});

describe("WhatsApp notify time", () => {
  it("fires notes with a due date, not only when reminder_manual is set", () => {
    assert.equal(
      resolveItemNotifyAt({
        is_actionable: false,
        due_date: "2026-09-17T09:00:00+03:00",
        metadata: {},
      }),
      "2026-09-17T09:00:00+03:00",
    );
  });

  it("does not fire disabled reminders", () => {
    assert.equal(
      resolveItemNotifyAt({
        is_actionable: true,
        due_date: "2026-09-17T09:00:00+03:00",
        metadata: { reminder_disabled: true },
      }),
      null,
    );
  });
});

describe("WhatsApp fire stamp", () => {
  it("records and detects a fire that already went to WhatsApp", () => {
    const stamped = stampWhatsAppReminderFireAt(
      { reminder_sent: false },
      "2026-09-17T09:00:00+03:00",
    );
    assert.equal(
      whatsappReminderFireStamp(stamped),
      "2026-09-17T09:00:00+03:00",
    );
    assert.equal(whatsappReminderFireStamp({}), null);
  });
});

describe("after reminder sent (edge copy)", () => {
  it("marks a one-shot reminder as sent", () => {
    const after = patchAfterReminderSent(
      { due_date: "2026-09-17T09:00:00.000Z", metadata: {} },
      "2026-09-17T09:00:00.000Z",
    );
    assert.equal(after.metadata.reminder_sent, true);
    assert.equal(after.due_date, undefined);
  });

  it("rolls a daily reminder forward instead of skipping it", () => {
    const after = patchAfterReminderSent(
      {
        due_date: "2026-09-17T09:00:00.000Z",
        metadata: { reminder_recurrence: "daily" },
      },
      "2026-09-17T09:00:00.000Z",
    );
    assert.equal(after.metadata.reminder_sent, false);
    assert.ok(typeof after.due_date === "string");
    assert.notEqual(after.due_date, "2026-09-17T09:00:00.000Z");
  });
});

describe("Green-API group send", () => {
  it("posts sendMessage with the @g.us chat id", async () => {
    const calls: Array<{ url: string; body: { chatId: string; message: string } }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init?.body ?? "{}")) as { chatId: string; message: string },
      });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      await sendViaUserGreenApi(
        {
          instance_id: "1100000001",
          api_token: "token",
          api_url: "https://api.greenapi.com",
        },
        "120363000000000001@g.us",
        "⏰ תזכורת משימה מ-BabiTk",
      );
      assert.equal(calls.length, 1);
      assert.match(calls[0].url, /waInstance1100000001\/sendMessage\/token/);
      assert.equal(calls[0].body.chatId, "120363000000000001@g.us");
      assert.match(calls[0].body.message, /תזכורת משימה/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
