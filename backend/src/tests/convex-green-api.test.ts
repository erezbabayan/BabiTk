import { describe, it } from "node:test";

import assert from "node:assert/strict";

import {
  extractGreenApiSenderId,
  isDirectWhatsAppChat,
  isGreenApiHistoryAudio,
  isGroupWhatsAppChat,
  isSystemWhatsAppReply,
  parseGreenApiWebhook,
  phoneLookupVariants,
  verifyGreenApiWebhookAuth,
} from "../../../convex/lib/greenApiParser.js";
import { isOwnerWhatsAppSender } from "../../../convex/lib/whatsappCaptureGroup.js";
import { normalizePhone, phoneFromWhatsAppId } from "../../../convex/lib/phone.js";

const OWNER_WID = "972526448067@c.us";
const CAPTURE_GROUP = "120363000000000001@g.us";
const OTHER_GROUP = "120363000000000002@g.us";
const PEER = "972501234567@c.us";

function ownerGroupPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    typeWebhook: "outgoingMessageReceived",
    idMessage: "g1",
    instanceData: { wid: OWNER_WID },
    senderData: {
      chatId: CAPTURE_GROUP,
      sender: OWNER_WID,
      chatName: "BabaiTk קליטה",
    },
    messageData: {
      typeMessage: "textMessage",
      textMessageData: { textMessage: "קנה חלב" },
    },
    ...overrides,
  };
}

describe("Convex Green-API parser", () => {
  it("converts Israeli local to E.164", () => {
    assert.equal(normalizePhone("0501234567"), "+972501234567");
  });

  it("parses Green-API chat id", () => {
    assert.equal(phoneFromWhatsAppId("972501234567@c.us"), "+972501234567");
  });

  it("captures owner text in capture group", () => {
    const { ignored, messages } = parseGreenApiWebhook(ownerGroupPayload());
    assert.equal(ignored, false);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.chatId, CAPTURE_GROUP);
    assert.equal(messages[0]?.senderPhone, "+972526448067");
    assert.equal(messages[0]?.text, "קנה חלב");
  });

  it("ignores 1:1 incoming peer messages", () => {
    const { messages, reason } = parseGreenApiWebhook({
      typeWebhook: "incomingMessageReceived",
      idMessage: "p1",
      instanceData: { wid: OWNER_WID },
      senderData: { chatId: PEER, sender: PEER },
      messageData: {
        typeMessage: "textMessage",
        textMessageData: { textMessage: "שלום" },
      },
    });
    assert.equal(messages.length, 0);
    assert.equal(reason, "not_capture_chat");
  });

  it("captures owner group posts when Green-API omits instance wid", () => {
    const { ignored, messages } = parseGreenApiWebhook(
      ownerGroupPayload({
        instanceData: { idInstance: 111 },
        senderData: {
          chatId: CAPTURE_GROUP,
          sender: "254150445125772@lid",
          chatName: "BabaiTk קליטה",
        },
      }),
    );
    assert.equal(ignored, false);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.text, "קנה חלב");
    assert.equal(messages[0]?.chatId, CAPTURE_GROUP);
  });

  it("captures incoming group posts when instance wid is only a WhatsApp @lid", () => {
    const { ignored, messages } = parseGreenApiWebhook({
      typeWebhook: "incomingMessageReceived",
      idMessage: "lid-in",
      instanceData: { idInstance: 111, wid: "254150445125772@lid" },
      senderData: {
        chatId: CAPTURE_GROUP,
        sender: "254150445125772@lid",
        chatName: "BabaiTk קליטה",
      },
      messageData: {
        typeMessage: "textMessage",
        textMessageData: { textMessage: "לתאם פגישה עם ברעד" },
      },
    });
    assert.equal(ignored, false);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.text, "לתאם פגישה עם ברעד");
  });

  it("still ignores 1:1 peer chats when wid is missing", () => {
    const { messages } = parseGreenApiWebhook({
      typeWebhook: "incomingMessageReceived",
      idMessage: "p-nowid",
      instanceData: { idInstance: 111 },
      senderData: { chatId: PEER, sender: PEER },
      messageData: {
        typeMessage: "textMessage",
        textMessageData: { textMessage: "שלום" },
      },
    });
    assert.equal(messages.length, 0);
  });

  it("captures owner group text when sender is WhatsApp @lid", () => {
    const { ignored, messages } = parseGreenApiWebhook(
      ownerGroupPayload({
        senderData: {
          chatId: CAPTURE_GROUP,
          sender: "123456789012345@lid",
          chatName: "BabaiTk קליטה",
        },
      }),
    );
    assert.equal(ignored, false);
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.chatId, CAPTURE_GROUP);
    assert.equal(messages[0]?.senderPhone, "+972526448067");
    assert.equal(messages[0]?.text, "קנה חלב");
  });

  it("treats pttMessage like audioMessage", () => {
    assert.equal(isGreenApiHistoryAudio("pttMessage"), true);
    assert.equal(isGreenApiHistoryAudio("audioMessage"), true);
    assert.equal(isGreenApiHistoryAudio("textMessage"), false);
    const { messages } = parseGreenApiWebhook(
      ownerGroupPayload({
        idMessage: "ptt-1",
        messageData: {
          typeMessage: "pttMessage",
          fileMessageData: { mimeType: "audio/ogg; codecs=opus" },
        },
      }),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.type, "audio");
    assert.equal(messages[0]?.audioUrl, undefined);
  });

  it("captures owner group audio even without downloadUrl", () => {
    const { messages } = parseGreenApiWebhook(
      ownerGroupPayload({
        idMessage: "a-no-url",
        messageData: {
          typeMessage: "audioMessage",
          fileMessageData: {
            mimeType: "audio/ogg",
          },
        },
      }),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.type, "audio");
    assert.equal(messages[0]?.audioUrl, undefined);
  });

  it("ignores group messages from other participants", () => {
    const { messages } = parseGreenApiWebhook({
      typeWebhook: "incomingMessageReceived",
      idMessage: "g-peer",
      instanceData: { wid: OWNER_WID },
      senderData: {
        chatId: CAPTURE_GROUP,
        sender: PEER,
      },
      messageData: {
        typeMessage: "textMessage",
        textMessageData: { textMessage: "מה קורה" },
      },
    });
    assert.equal(messages.length, 0);
  });

  it("parses owner audio in capture group", () => {
    const { messages } = parseGreenApiWebhook(
      ownerGroupPayload({
        idMessage: "a1",
        messageData: {
          typeMessage: "audioMessage",
          fileMessageData: {
            downloadUrl: "https://api.greenapi.com/download/voice.ogg",
            mimeType: "audio/ogg",
          },
        },
      }),
    );
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.type, "audio");
  });

  it("ignores non-inbound webhooks", () => {
    const result = parseGreenApiWebhook({ typeWebhook: "outgoingMessageStatus" });
    assert.equal(result.ignored, true);
  });

  it("detects group vs direct chats", () => {
    assert.equal(isDirectWhatsAppChat("972501234567@c.us"), true);
    assert.equal(isDirectWhatsAppChat(CAPTURE_GROUP), false);
    assert.equal(isGroupWhatsAppChat(CAPTURE_GROUP), true);
  });

  it("owner sender matches instance wid", () => {
    assert.equal(isOwnerWhatsAppSender(OWNER_WID, OWNER_WID), true);
    assert.equal(isOwnerWhatsAppSender(PEER, OWNER_WID), false);
  });

  it("extracts sender_id from group payload", () => {
    assert.equal(extractGreenApiSenderId(ownerGroupPayload()), "972526448067");
  });

  it("captures quoted replies using the new text, not the quoted original", () => {
    const { ignored, messages } = parseGreenApiWebhook(
      ownerGroupPayload({
        idMessage: "q1",
        messageData: {
          typeMessage: "quotedMessage",
          extendedTextMessageData: { text: "* חלב" },
          quotedMessage: { textMessage: "תזכורת ישנה" },
        },
      }),
    );
    assert.equal(ignored, false);
    assert.equal(messages[0]?.text, "* חלב");
  });

  it("does not re-ingest BabiTk system answers", () => {
    assert.equal(
      isSystemWhatsAppReply("BabiTk · תשובה (לא נרשם פריט)\n\nשאלה: חלב"),
      true,
    );
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
