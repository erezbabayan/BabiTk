import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildWhatsAppReminderMessage,
  resolveGreenApiChatId,
  resolveReminderDestination,
} from "../lib/whatsapp-reminder-message.js";

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

  it("falls back to the verified phone when group reminders are off", () => {
    assert.deepEqual(
      resolveReminderDestination({
        notify_whatsapp_group: false,
        whatsapp_capture_group_chat_id: "120363000000000001@g.us",
        phone: "+972501234567",
        phone_verified: true,
      }),
      { kind: "phone", phone: "+972501234567" },
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
