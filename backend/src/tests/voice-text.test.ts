import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isInsertableInboundText,
  isVoicePlaceholderText,
  titleFromInboundText,
} from "../lib/ingest/voice-text.js";

describe("voice-text", () => {
  it("rejects the WhatsApp voice placeholder as item content", () => {
    assert.equal(isVoicePlaceholderText("הודעה קולית מוואטסאפ"), true);
    assert.equal(isVoicePlaceholderText("הודעה קולית"), true);
    assert.equal(isVoicePlaceholderText("לקנות חלב מחר"), false);
    assert.equal(isVoicePlaceholderText("ממתין לתמלול"), false);
  });

  it("uses the first transcribed line as the title", () => {
    assert.equal(
      titleFromInboundText("לקנות חלב מחר\nוא גם לחם"),
      "לקנות חלב מחר",
    );
  });

  it("allows only real prose into the system", () => {
    assert.equal(isInsertableInboundText("לקנות חלב", "לקנות חלב מחר"), true);
    assert.equal(isInsertableInboundText("מתמלל…", ""), false);
    assert.equal(isInsertableInboundText("ממתין לתמלול", ""), false);
    assert.equal(isInsertableInboundText("הודעה קולית", "הודעה קולית מוואטסאפ"), false);
    assert.equal(isInsertableInboundText("תמונה מוואטסאפ", "תמונה מוואטסאפ"), false);
    assert.equal(isInsertableInboundText("פריט מוואטסאפ", ""), false);
    assert.equal(isInsertableInboundText("", ""), false);
  });
});
