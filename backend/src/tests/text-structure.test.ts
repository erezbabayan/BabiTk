import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatStructuredNoteBody,
  preserveInboundLineStructure,
  stripMarkdownEmphasis,
} from "../../../convex/lib/ingest/textStructure.js";
import { sanitizeInboundText } from "../../../convex/openaiPipeline.js";
import { parseInputLocally } from "../../../convex/lib/ingest/localParse.js";

describe("text structure for long notes", () => {
  it("preserves newlines in sanitizeInboundText", () => {
    const result = sanitizeInboundText("כותרת\nשורה אחת\nשורה שתיים");
    assert.equal(result.accepted, true);
    assert.equal(result.text, "כותרת\nשורה אחת\nשורה שתיים");
  });

  it("strips markdown bold and formats body lines", () => {
    const raw = "**פרטים**\nשם: רועי\nטלפון: 050";
    const out = formatStructuredNoteBody(raw);
    assert.equal(out.includes("**"), false);
    assert.ok(out.includes("\n"));
    assert.ok(out.includes("פרטים"));
  });

  it("keeps a multi-line note as one local item with line breaks", () => {
    const text = "פרטי לקוח\nשם: דנה\nכתובת: תל אביב\nטלפון: 052";
    const parsed = parseInputLocally({
      text,
      timezone: "Asia/Jerusalem",
      locale: "he-IL",
      referenceDate: new Date("2026-07-19T10:00:00+03:00"),
      allowedTags: ["מידע", "כללי"],
    });
    assert.equal(parsed.items.length, 1);
    assert.ok(parsed.items[0]!.content.includes("\n"));
    assert.ok(parsed.items[0]!.content.includes("שם"));
  });

  it("preserveInboundLineStructure collapses spaces but not newlines", () => {
    assert.equal(
      preserveInboundLineStructure("א  ב\n  ג   ד  "),
      "א ב\n  ג ד",
    );
  });

  it("stripMarkdownEmphasis removes markers", () => {
    assert.equal(stripMarkdownEmphasis("שלום **עולם**"), "שלום עולם");
  });
});
