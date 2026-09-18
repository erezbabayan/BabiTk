import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateCaptureGate } from "../../../convex/lib/whatsappCaptureGroup.js";

const OWNER_PHONE = "+972526448067";
const PERSONAL = "972526448067@c.us";
const CAPTURE_GROUP = "120363000000000001@g.us";
const OTHER_GROUP = "120363000000000002@g.us";
const PEER = "972501234567@c.us";

describe("evaluateCaptureGate", () => {
  it("rejects random chats when no capture group is set", () => {
    const decision = evaluateCaptureGate(
      { phone: OWNER_PHONE, captureGroupChatId: null, captureGroupName: null },
      OTHER_GROUP,
      "משפחה",
    );
    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.equal(decision.reason, "capture_group_not_set");
    }
  });

  it("rejects 1:1 peer chats when no capture group is set", () => {
    const decision = evaluateCaptureGate(
      { phone: OWNER_PHONE, captureGroupChatId: null },
      PEER,
    );
    assert.equal(decision.allowed, false);
  });

  it("auto-binds the owner's Message Yourself chat when unset", () => {
    const decision = evaluateCaptureGate(
      { phone: OWNER_PHONE, captureGroupChatId: null },
      PERSONAL,
      "הודעה לעצמי",
    );
    assert.equal(decision.allowed, true);
    if (decision.allowed) {
      assert.equal(decision.bind?.chatId, PERSONAL);
    }
  });

  it("allows the configured group", () => {
    const decision = evaluateCaptureGate(
      {
        phone: OWNER_PHONE,
        captureGroupChatId: CAPTURE_GROUP,
        captureGroupName: "BabaiTk קליטה",
      },
      CAPTURE_GROUP,
    );
    assert.equal(decision.allowed, true);
    if (decision.allowed) {
      assert.equal(decision.bind, undefined);
    }
  });

  it("rejects a different group than the one configured", () => {
    const decision = evaluateCaptureGate(
      {
        phone: OWNER_PHONE,
        captureGroupChatId: CAPTURE_GROUP,
        captureGroupName: "BabaiTk קליטה",
      },
      OTHER_GROUP,
      "אחר",
    );
    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.equal(decision.reason, "wrong_capture_group");
    }
  });

  it("upgrades default personal capture to the first owner group", () => {
    const decision = evaluateCaptureGate(
      {
        phone: OWNER_PHONE,
        captureGroupChatId: PERSONAL,
        captureGroupName: "הודעה לעצמי",
      },
      CAPTURE_GROUP,
      "קליטה",
    );
    assert.equal(decision.allowed, true);
    if (decision.allowed) {
      assert.equal(decision.bind?.chatId, CAPTURE_GROUP);
    }
  });
});
