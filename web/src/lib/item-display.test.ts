import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildItemDisplayFields, formatSubtaskCount } from "./item-display.js";
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

describe("subtask count on board cards", () => {
  it("counts checklist rows, not content line breaks", () => {
    const display = buildItemDisplayFields({
      title: "קניות",
      content: "לקנות חלב\nלהתקשר לרועי\nלשלוח מייל",
      tags: [],
      is_actionable: true,
      due_date: null,
      metadata: {
        checklist: [
          { id: "a", text: "חלב", done: false },
          { id: "b", text: "לחם", done: true },
        ],
      },
    });
    assert.equal(display.subtaskCount, 2);
    assert.equal(formatSubtaskCount(display.subtaskCount), "2");
    assert.equal(display.isItemExpandable, true);
  });

  it("ignores OCR and multi-line notes when there is no checklist", () => {
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
          ],
        },
      },
    });
    assert.equal(display.subtaskCount, 0);
  });

  it("is zero when there are no sub-tasks", () => {
    const display = buildItemDisplayFields({
      title: "לקנות חלב",
      content: "לקנות חלב",
      tags: [],
      is_actionable: true,
      due_date: null,
    });
    assert.equal(display.subtaskCount, 0);
    assert.equal(formatSubtaskCount(display.subtaskCount), null);
    assert.equal(display.isItemExpandable, false);
  });
});
