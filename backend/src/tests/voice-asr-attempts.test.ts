import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  VOICE_ASR_ATTEMPTS_KEY,
  VOICE_ASR_FINAL_STATUS,
  VOICE_ASR_MAX_ATTEMPTS,
  voiceAsrAttempts,
  voiceAsrAttemptsExhausted,
  voiceAsrErrorLabel,
  voiceAsrFinalMetadata,
  withVoiceAsrAttempt,
} from "../../../supabase/functions/_shared/voice-asr-attempts.ts";

describe("voice ASR attempt cap", () => {
  it("starts at zero and counts each attempt", () => {
    assert.equal(voiceAsrAttempts(null), 0);
    assert.equal(voiceAsrAttempts({ [VOICE_ASR_ATTEMPTS_KEY]: "bad" }), 0);
    let md: Record<string, unknown> = { source: "whatsapp_voice" };
    for (let i = 1; i <= VOICE_ASR_MAX_ATTEMPTS; i += 1) {
      assert.equal(voiceAsrAttemptsExhausted(md), false);
      md = withVoiceAsrAttempt(md, new Date("2026-10-23T00:00:00Z"));
      assert.equal(voiceAsrAttempts(md), i);
    }
    assert.equal(md.source, "whatsapp_voice");
    assert.equal(voiceAsrAttemptsExhausted(md), true);
  });

  it("final metadata is explicit and keeps existing keys", () => {
    const md = voiceAsrFinalMetadata(
      { chat_id: "x@g.us", voice_asr_attempts: 3 },
      new Error("transcription_failed: groq 400"),
    );
    assert.equal(md.voice_transcription_status, VOICE_ASR_FINAL_STATUS);
    assert.equal(md.chat_id, "x@g.us");
    assert.equal(md.voice_asr_attempts, 3);
    assert.equal(md.voice_transcribe_started_at, null);
    assert.match(String(md.voice_asr_last_error), /transcription_failed/);
  });

  it("error labels never carry URLs or long tokens", () => {
    const label = voiceAsrErrorLabel(
      new Error(
        "download failed https://api.green-api.com/waInstance1/downloadFile/abcdefabcdefabcdefabcdefabcdefabcdef1234",
      ),
    );
    assert.doesNotMatch(label, /https?:/);
    assert.doesNotMatch(label, /abcdefabcdefabcdef/);
  });
});
