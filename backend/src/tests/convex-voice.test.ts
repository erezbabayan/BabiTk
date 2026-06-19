import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeInboundText,
  estimateAudioSeconds,
} from "../../../convex/openaiPipeline.js";
import { parseInputLocally } from "../../../convex/lib/ingest/localParse.js";
import { isValidParseResponse } from "../../../convex/lib/ingest/types.js";

describe("Convex Voice pipeline helpers", () => {
  it("sanitizes meaningful Hebrew transcription", () => {
    const result = sanitizeInboundText("  לקנות חלב מחר בבוקר  ");
    assert.equal(result.accepted, true);
    assert.equal(result.text, "לקנות חלב מחר בבוקר");
  });

  it("rejects empty transcription", () => {
    const result = sanitizeInboundText("  ");
    assert.equal(result.accepted, false);
  });

  it("estimates audio duration from buffer size", () => {
    const buffer = Buffer.alloc(32_000);
    assert.equal(estimateAudioSeconds(buffer), 2);
  });

  it("local parse returns valid JSON schema for voice fallback", () => {
    const parsed = parseInputLocally({
      text: "לקנות חלב מחר",
      timezone: "Asia/Jerusalem",
      locale: "he-IL",
      referenceDate: new Date("2026-06-18T10:00:00+03:00"),
    });

    assert.equal(isValidParseResponse(parsed), true);
    assert.ok(parsed.items.length >= 1);
    assert.equal(typeof parsed.items[0]?.title, "string");
    assert.equal(typeof parsed.items[0]?.is_actionable, "boolean");
    assert.ok(parsed.items[0]?.analysis);
  });
});
