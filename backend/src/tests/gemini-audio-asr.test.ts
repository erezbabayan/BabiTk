import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  geminiAudioMime,
  geminiAudioText,
  transcribeViaGeminiAudio,
} from "../../../supabase/functions/_shared/gemini-audio-asr.ts";

describe("gemini audio asr fallback", () => {
  it("maps recorder mime types to Gemini audio types", () => {
    assert.equal(geminiAudioMime("audio/m4a"), "audio/mp4");
    assert.equal(geminiAudioMime("audio/ogg; codecs=opus"), "audio/ogg");
    assert.equal(geminiAudioMime("audio/x-wav"), "audio/wav");
    assert.equal(geminiAudioMime(""), "audio/mp4");
  });

  it("extracts transcript text from generateContent payloads", () => {
    assert.equal(
      geminiAudioText({ candidates: [{ content: { parts: [{ text: " שלום " }, { text: "עולם" }] } }] }),
      "שלום עולם",
    );
    assert.equal(geminiAudioText(null), "");
    assert.equal(geminiAudioText({ error: { message: "x" } }), "");
  });

  it("fails fast without a key so the chain moves on", async () => {
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    await assert.rejects(transcribeViaGeminiAudio(new Uint8Array([1, 2]), "audio/mp4"), /gemini_not_configured/);
    if (previous !== undefined) process.env.GEMINI_API_KEY = previous;
  });
});
