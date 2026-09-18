import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  asrUploadVariants,
  isLikelyAudioBytes,
  sniffAudioContainer,
} from "../../../supabase/functions/_shared/audio-format.ts";

function oggHeader(): Uint8Array {
  const bytes = new Uint8Array(80);
  bytes.set([0x4f, 0x67, 0x67, 0x53, 0, 2, 0, 0]);
  bytes.fill(1, 8);
  return bytes;
}

function wavHeader(): Uint8Array {
  const bytes = new Uint8Array(80);
  bytes.set([0x52, 0x49, 0x46, 0x46]);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8);
  bytes.fill(1, 12);
  return bytes;
}

describe("WhatsApp audio sniff", () => {
  it("detects OggS WhatsApp voice notes", () => {
    assert.equal(sniffAudioContainer(oggHeader()), "ogg");
    assert.equal(isLikelyAudioBytes(oggHeader()), true);
  });

  it("detects WAV recordings", () => {
    assert.equal(sniffAudioContainer(wavHeader()), "wav");
  });

  it("rejects JSON or HTML downloads", () => {
    const json = new TextEncoder().encode('{"error":"not ready"}' + "x".repeat(50));
    assert.equal(isLikelyAudioBytes(json), false);
    const html = new TextEncoder().encode("<!DOCTYPE html>" + "x".repeat(50));
    assert.equal(isLikelyAudioBytes(html), false);
  });

  it("tries ogg then opus filenames for WhatsApp PTT", () => {
    const variants = asrUploadVariants("msg.ogg", "audio/ogg; codecs=opus", oggHeader());
    assert.deepEqual(
      variants.map((row) => row.fileName),
      ["audio.ogg", "audio.opus", "audio.oga"],
    );
  });
});
