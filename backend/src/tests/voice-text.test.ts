import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isVoicePlaceholderText,
  titleFromInboundText,
} from "../lib/ingest/voice-text.js";

describe("voice-text", () => {
  it("rejects the WhatsApp voice placeholder as item content", () => {
    assert.equal(isVoicePlaceholderText("הודעה קולית מוואטסאפ"), true);
    assert.equal(isVoicePlaceholderText("הודעה קולית"), true);
    assert.equal(isVoicePlaceholderText("לקנות חלב מחר"), false);
  });

  it("uses the first transcribed line as the title", () => {
    assert.equal(
      titleFromInboundText("לקנות חלב מחר\nוא גם לחם"),
      "לקנות חלב מחר",
    );
  });
});
