import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildItemDisplayFields, formatSubtaskCount, visibleChecklistEntries } from "./item-display.js";
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

  it("shows the next occurrence for a recurring task with a stale due date", () => {
    const display = buildItemDisplayFields(
      {
        title: "סנאט מילואים",
        content: "",
        tags: [],
        is_actionable: true,
        due_date: "2026-09-10T09:00:00+03:00",
        metadata: { reminder_recurrence: "weekly" },
      },
      Date.parse("2026-09-17T12:00:00+03:00"),
    );

    assert.equal(display.dateLabel, "17/09/2026");
    assert.match(display.reminderLabel ?? "", /שבועי/);
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

  it("does not expand a short card with five or fewer sub-tasks", () => {
    const display = buildItemDisplayFields({
      title: "קניות",
      content: "קניות",
      tags: [],
      is_actionable: true,
      due_date: null,
      metadata: {
        checklist: [
          { id: "a", text: "חלב", done: false },
          { id: "b", text: "לחם", done: false },
        ],
      },
    });
    assert.equal(display.subtaskCount, 2);
    assert.equal(display.isItemExpandable, false);
  });

  it("expands list cards with more than five sub-tasks", () => {
    const rows = ["א", "ב", "ג", "ד", "ה", "ו"].map((text, index) => ({
      id: String(index),
      text,
      done: false,
    }));
    const display = buildItemDisplayFields({
      title: "קניות",
      content: "קניות",
      tags: [],
      is_actionable: true,
      due_date: null,
      metadata: { checklist: rows },
    });
    assert.equal(display.subtaskCount, 6);
    assert.equal(display.isItemExpandable, true);
    assert.deepEqual(
      visibleChecklistEntries(rows, false).map((row) => row.text),
      ["א", "ב", "ג", "ד", "ה"],
    );
    assert.equal(visibleChecklistEntries(rows, true).length, 6);
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
