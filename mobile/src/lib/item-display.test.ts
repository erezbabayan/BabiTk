import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolveVoiceDisplayText, VOICE_TRANSCRIBING_TITLE } from "./voice-text.ts";

describe("mobile voice card headline", () => {
  it("shows מתמלל while a voice note still has no transcript", () => {
    const display = resolveVoiceDisplayText({
      title: "הודעה קולית",
      content: "הודעה קולית",
      metadata: { whatsapp_message_id: "wamid.1" },
      source_materials: {
        storage_url: "https://example.com/a.ogg",
        raw_text: "הודעה קולית",
      },
    });
    assert.equal(display.title, VOICE_TRANSCRIBING_TITLE);
    assert.equal(display.content, "");
  });

  it("keeps a stored transcript once ASR finishes", () => {
    const display = resolveVoiceDisplayText({
      title: "הודעה קולית",
      content: "הודעה קולית",
      metadata: {
        whatsapp_message_id: "wamid.1",
        corrected_transcription: "לקנות חלב מחר",
      },
    });
    assert.equal(display.title, "לקנות חלב מחר");
  });

  it("is applied by the card display fields", () => {
    const sourcePath = decodeURIComponent(new URL("./item-display.ts", import.meta.url).pathname);
    const source = readFileSync(sourcePath, "utf8");
    assert.match(source, /resolveVoiceDisplayText\(item\)/);
    assert.match(source, /title: voiceText\.title/);
  });
});