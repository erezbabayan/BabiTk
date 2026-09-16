import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildItemDisplayFields } from "./item-display.js";
import { isVoicePlaceholderText, VOICE_TRANSCRIBING_TITLE } from "./voice-text.js";

describe("buildItemDisplayFields voice placeholders", () => {
  it("does not show the WhatsApp voice placeholder as the card headline", () => {
    const display = buildItemDisplayFields({
      title: "הודעה קולית מוואטסאפ",
      content: "הודעה קולית מוואטסאפ",
      tags: [],
      is_actionable: true,
      due_date: null,
      metadata: { whatsapp_message_id: "abc" },
      source_materials: {
        id: "src-1",
        source_type: "whatsapp_voice",
        storage_url: "https://example.com/a.ogg",
        raw_text: "הודעה קולית מוואטסאפ",
      },
    });

    assert.equal(isVoicePlaceholderText(display.headline), false);
    assert.equal(isVoicePlaceholderText(display.fullHeadline), false);
    assert.equal(display.headline, VOICE_TRANSCRIBING_TITLE);
  });

  it("shows due dates as dd/mm/yyyy", () => {
    const display = buildItemDisplayFields({
      title: "משימה",
      content: "",
      tags: [],
      is_actionable: true,
      due_date: "2026-09-18T12:00:00",
    });

    assert.equal(display.dateLabel, "18/09/2026");
  });
});
