import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasHebrewLetters,
  parseGradioSseText,
  pickTranscriptFromGradioData,
  stripAsrTimestamps,
} from "../../../convex/lib/ingest/hebrewAsrPublicClient";

describe("hebrew public ASR client", () => {
  it("parses the official Whisper space SSE payload", () => {
    const sse = [
      "event: generating",
      'data: ["..."]',
      "",
      "event: complete",
      'data: [" We\'ll be right back."]',
      "",
    ].join("\n");
    assert.equal(parseGradioSseText(sse), "We'll be right back.");
  });

  it("strips ivrit-style timestamps and status lines", () => {
    const sse = [
      "event: generating",
      'data: ["Done!", ""]',
      "",
      "event: complete",
      'data: ["Done!", "[0.00s -> 0.96s] לקנות חלב מחר"]',
      "",
    ].join("\n");
    assert.equal(parseGradioSseText(sse), "לקנות חלב מחר");
  });

  it("picks the longest real transcript from mixed Gradio data", () => {
    assert.equal(
      pickTranscriptFromGradioData(["Done!", "[1.00s -> 2.00s] יאללה סבבה"]),
      "יאללה סבבה",
    );
    assert.equal(stripAsrTimestamps("[0.00s -> 1.20s] שלום"), "שלום");
    assert.equal(hasHebrewLetters("לקנות"), true);
    assert.equal(hasHebrewLetters("hello"), false);
  });
});
