import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AWAIT_EDGE_ON_CAPTURE,
  canSendAudioToEdge,
  composeHebrewWhisperPrompt,
  FAST_VOICE_ASR_CASCADE,
  isUsableLiveTranscript,
  joinSpeechRecognitionTranscripts,
  MAX_EDGE_AUDIO_BYTES,
  parseEdgeVoicePayload,
  pickBestHebrewTranscript,
  uint8ToBase64,
} from "./fast-voice-asr.ts";

describe("fast Hebrew ASR helpers", () => {
  it("persists immediately and refines Groq in the background", () => {
    assert.deepEqual(FAST_VOICE_ASR_CASCADE, [
      "persist-now",
      "background-edge-groq",
      "repair-gradio",
    ]);
    assert.equal(AWAIT_EDGE_ON_CAPTURE, false);
  });

  it("accepts short recordings and rejects empty or oversized blobs", () => {
    assert.equal(canSendAudioToEdge(64), true);
    assert.equal(canSendAudioToEdge(63), false);
    assert.equal(canSendAudioToEdge(MAX_EDGE_AUDIO_BYTES), true);
    assert.equal(canSendAudioToEdge(MAX_EDGE_AUDIO_BYTES + 1), false);
  });

  it("treats short Hebrew captions as usable live transcripts", () => {
    assert.equal(isUsableLiveTranscript("לקנות חלב"), true);
    assert.equal(isUsableLiveTranscript("שלום"), true);
    assert.equal(isUsableLiveTranscript("  "), false);
    assert.equal(isUsableLiveTranscript("ok"), false);
    assert.equal(isUsableLiveTranscript("call mom later"), true);
  });

  it("joins streaming speech results", () => {
    assert.equal(
      joinSpeechRecognitionTranscripts([
        { transcript: "לקנות" },
        { transcript: " חלב מחר " },
      ]),
      "לקנות חלב מחר",
    );
  });

  it("appends a live hint to the Whisper prompt", () => {
    const prompt = composeHebrewWhisperPrompt("לקנות חלב לרועי");
    assert.match(prompt, /עברית מדוברת/);
    assert.match(prompt, /לקנות חלב לרועי/);
    assert.equal(composeHebrewWhisperPrompt("   "), composeHebrewWhisperPrompt());
  });

  it("parses ingest-voice / transcribe-voice-item payloads", () => {
    assert.deepEqual(
      parseEdgeVoicePayload({
        ok: true,
        itemId: "abc",
        title: "לקנות חלב",
        content: "לקנות חלב מחר",
      }),
      {
        ok: true,
        itemId: "abc",
        title: "לקנות חלב",
        content: "לקנות חלב מחר",
        alreadyTranscribed: false,
        answered: false,
      },
    );
    assert.equal(parseEdgeVoicePayload({ qrBase64: "xx" }), null);
    assert.throws(
      () => parseEdgeVoicePayload({ error: "transcription_failed" }),
      /transcription_failed/,
    );
  });

  it("encodes audio bytes as base64", () => {
    assert.equal(uint8ToBase64(new Uint8Array([72, 105])), "SGk=");
  });

  it("keeps Groq Hebrew and replaces English drift with the live caption", () => {
    assert.equal(pickBestHebrewTranscript("לקנות חלב", "לקנות מים"), "לקנות חלב");
    assert.equal(pickBestHebrewTranscript("buy milk please", "לקנות חלב"), "לקנות חלב");
    assert.equal(pickBestHebrewTranscript("חלב", "לקנות חלב מחר בבוקר"), "לקנות חלב מחר בבוקר");
  });
});
