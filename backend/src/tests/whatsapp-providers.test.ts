import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectWebhookProvider,
  parseGenericWebhook,
  parseGreenApiWebhook,
  parseMetaWebhook,
  parseWhapiWebhook,
} from "../services/whatsapp/parsers.js";

describe("WhatsApp webhook parsers", () => {
  it("parses Meta text message", () => {
    const { messages } = parseMetaWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "m1",
                    from: "972501234567",
                    type: "text",
                    text: { body: "קנה חלב" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.type, "text");
    assert.equal(messages[0]?.text, "קנה חלב");
    assert.equal(messages[0]?.from, "+972501234567");
  });

  it("parses Green-API audio with download URL", () => {
    const { messages } = parseGreenApiWebhook({
      typeWebhook: "incomingMessageReceived",
      idMessage: "g1",
      senderData: { chatId: "972501234567@c.us" },
      messageData: {
        typeMessage: "audioMessage",
        fileMessageData: {
          downloadUrl: "https://api.greenapi.com/download/audio.ogg",
          mimeType: "audio/ogg",
        },
      },
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.type, "audio");
    assert.equal(messages[0]?.audioUrl, "https://api.greenapi.com/download/audio.ogg");
  });

  it("parses Whapi voice note", () => {
    const { messages } = parseWhapiWebhook({
      messages: [
        {
          id: "w1",
          from_me: false,
          type: "voice",
          from: "972501234567",
          voice: {
            link: "https://cdn.example.com/voice.oga",
            mime_type: "audio/ogg",
          },
        },
      ],
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.type, "audio");
    assert.equal(messages[0]?.audioUrl, "https://cdn.example.com/voice.oga");
  });

  it("parses generic tutorial webhook shape", () => {
    const { messages } = parseGenericWebhook({
      message: {
        id: "x1",
        sender_id: "972501234567",
        type: "image",
        image: { url: "https://cdn.example.com/note.jpg" },
      },
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.type, "image");
    assert.equal(messages[0]?.imageUrl, "https://cdn.example.com/note.jpg");
  });

  it("detects provider from payload shape", () => {
    assert.equal(detectWebhookProvider({ entry: [] }), "meta");
    assert.equal(
      detectWebhookProvider({ typeWebhook: "incomingMessageReceived" }),
      "green-api",
    );
    assert.equal(detectWebhookProvider({ messages: [] }), "whapi");
    assert.equal(detectWebhookProvider({ message: {} }), "generic");
  });
});
