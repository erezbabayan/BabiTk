import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  extractGreenApiSenderId,
  isDirectWhatsAppChat,
  parseGreenApiWebhook,
  phoneLookupVariants,
  verifyGreenApiWebhookAuth,
} from "../../../convex/lib/greenApiParser.js";
import { normalizePhone, phoneFromWhatsAppId } from "../../../convex/lib/phone.js";

describe("Convex Green-API parser", () => {
  it("converts Israeli local to E.164", () => {
    assert.equal(normalizePhone("0501234567"), "+972501234567");
  });

  it("parses Green-API chat id", () => {
    assert.equal(phoneFromWhatsAppId("972501234567@c.us"), "+972501234567");
  });

  it("extracts sender_id and text", () => {
    const body = {
      typeWebhook: "incomingMessageReceived",
      idMessage: "g1",
      senderData: { chatId: "972501234567@c.us" },
      messageData: {
        typeMessage: "textMessage",
        textMessageData: { textMessage: "קנה חלב" },
      },
    };

    assert.equal(extractGreenApiSenderId(body), "972501234567");

    const { ignored, messages } = parseGreenApiWebhook(body);
    assert.equal(ignored, false);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.senderId, "972501234567");
    assert.equal(messages[0]?.senderPhone, "+972501234567");
    assert.equal(messages[0]?.type, "text");
    assert.equal(messages[0]?.text, "קנה חלב");
  });

  it("parses extendedTextMessage as text", () => {
    const { messages } = parseGreenApiWebhook({
      typeWebhook: "incomingMessageReceived",
      idMessage: "g2",
      senderData: { chatId: "972501234567@c.us" },
      messageData: {
        typeMessage: "extendedTextMessage",
        extendedTextMessageData: { text: "https://example.com/task" },
      },
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.type, "text");
    assert.equal(messages[0]?.text, "https://example.com/task");
  });

  it("parses audioMessage", () => {
    const { messages } = parseGreenApiWebhook({
      typeWebhook: "incomingMessageReceived",
      idMessage: "a1",
      senderData: { chatId: "972501234567@c.us" },
      messageData: {
        typeMessage: "audioMessage",
        fileMessageData: {
          downloadUrl: "https://api.greenapi.com/download/voice.ogg",
          mimeType: "audio/ogg",
        },
      },
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.type, "audio");
    assert.equal(messages[0]?.audioUrl, "https://api.greenapi.com/download/voice.ogg");
  });

  it("parses image document as image", () => {
    const { messages } = parseGreenApiWebhook({
      typeWebhook: "incomingMessageReceived",
      idMessage: "d1",
      senderData: { chatId: "972501234567@c.us" },
      messageData: {
        typeMessage: "documentMessage",
        fileMessageData: {
          downloadUrl: "https://api.greenapi.com/download/scan.jpg",
          mimeType: "image/jpeg",
        },
      },
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.type, "image");
  });

  it("ignores non-inbound webhooks", () => {
    const result = parseGreenApiWebhook({ typeWebhook: "outgoingMessageStatus" });
    assert.equal(result.ignored, true);
  });

  it("ignores group chats", () => {
    assert.equal(isDirectWhatsAppChat("972501234567@c.us"), true);
    assert.equal(isDirectWhatsAppChat("120363000000000000@g.us"), false);

    const result = parseGreenApiWebhook({
      typeWebhook: "incomingMessageReceived",
      senderData: { chatId: "120363000000000000@g.us" },
      messageData: {
        typeMessage: "textMessage",
        textMessageData: { textMessage: "hello group" },
      },
    });
    assert.equal(result.ignored, true);
    assert.equal(result.reason, "group_chat");
  });

  it("accepts bearer webhook token", () => {
    const request = new Request("https://example.com/webhook/green-api", {
      headers: { Authorization: "Bearer secret-token" },
    });
    assert.equal(verifyGreenApiWebhookAuth(request, "secret-token"), true);
  });

  it("includes local and international phone variants", () => {
    const variants = phoneLookupVariants("+972501234567");
    assert.ok(variants.includes("+972501234567"));
    assert.ok(variants.includes("0501234567"));
  });
});
