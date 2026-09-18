import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isVoicePlaceholderText,
  itemNeedsVoiceRepair,
  resolveVoiceDisplayText,
  VOICE_TRANSCRIBING_TITLE,
  VOICE_UNAVAILABLE_TITLE,
} from "./voice-text.ts";

describe("voice-text display", () => {
  it("never returns the WhatsApp voice placeholder as a headline", () => {
    const display = resolveVoiceDisplayText({
      title: "הודעה קולית מוואטסאפ",
      content: "הודעה קולית מוואטסאפ",
      metadata: { whatsapp_message_id: "msg-1" },
      source_materials: {
        id: "src-1",
        source_type: "whatsapp_voice",
        storage_url: "https://example.com/voice.ogg",
        raw_text: "הודעה קולית מוואטסאפ",
      },
    });

    assert.equal(isVoicePlaceholderText(display.title), false);
    assert.equal(display.title, VOICE_TRANSCRIBING_TITLE);
    assert.equal(display.transcribing, true);
  });

  it("uses a stored transcription instead of the placeholder", () => {
    const display = resolveVoiceDisplayText({
      title: "הודעה קולית",
      content: "הודעה קולית",
      metadata: { corrected_transcription: "לקנות חלב מחר" },
      source_materials: null,
    });

    assert.equal(display.title, "לקנות חלב מחר");
    assert.equal(display.content, "לקנות חלב מחר");
    assert.equal(display.transcribing, false);
  });

  it("does not claim an item is transcribing when no audio exists", () => {
    const display = resolveVoiceDisplayText({
      title: "הודעה קולית",
      content: "הודעה קולית",
      metadata: {},
      source_materials: null,
    });

    assert.equal(display.title, VOICE_UNAVAILABLE_TITLE);
    assert.equal(itemNeedsVoiceRepair({
      title: "הודעה קולית",
      content: "הודעה קולית",
      metadata: {},
      source_materials: null,
    }), false);
  });

  it("repairs in-app pending voice when audio was stored", () => {
    assert.equal(
      itemNeedsVoiceRepair({
        title: VOICE_TRANSCRIBING_TITLE,
        content: "",
        metadata: { source: "app_voice", voice_storage_path: "user/1.webm" },
        source_materials: null,
      }),
      true,
    );
  });
});
