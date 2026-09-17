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

describe("active line count on board cards", () => {
  it("labels open OCR lines", () => {
    const display = buildItemDisplayFields({
      title: "רשימת קניות",
      content: "רשימת קניות",
      tags: [],
      is_actionable: true,
      due_date: null,
      source_materials: {
        id: "src-ocr",
        source_type: "notebook_ocr",
        storage_url: null,
        raw_text: "חלב\nלחם",
        metadata: {
          ocr_lines: [
            {
              text: "חלב",
              completed: false,
              bbox: { left: 0, top: 0, width: 1, height: 0.2 },
            },
            {
              text: "לחם",
              completed: false,
              bbox: { left: 0, top: 0.2, width: 1, height: 0.2 },
            },
            {
              text: "ביצים",
              completed: true,
              bbox: { left: 0, top: 0.4, width: 1, height: 0.2 },
            },
          ],
        },
      },
    });
    assert.equal(display.activeLineCountLabel, "2 שורות פעילות");
  });

  it("labels multi-line content when there is no OCR", () => {
    const display = buildItemDisplayFields({
      title: "משימות",
      content: "לקנות חלב\nלהתקשר לרועי\nלשלוח מייל",
      tags: [],
      is_actionable: true,
      due_date: null,
    });
    assert.equal(display.activeLineCountLabel, "3 שורות פעילות");
  });

  it("hides the label for a single content line", () => {
    const display = buildItemDisplayFields({
      title: "לקנות חלב",
      content: "לקנות חלב",
      tags: [],
      is_actionable: true,
      due_date: null,
    });
    assert.equal(display.activeLineCountLabel, null);
  });
});
