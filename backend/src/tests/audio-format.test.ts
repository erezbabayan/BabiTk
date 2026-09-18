import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  asrUploadVariants,
  audioDataUrl,
  isLikelyAudioBytes,
  isPublicMediaUrl,
  sniffAudioContainer,
} from "../../../supabase/functions/_shared/audio-format.ts";
import { parseGreenApiDownloadFileBody } from "../../../supabase/functions/_shared/green-api-media.ts";
import { parseGradioSseText } from "../../../supabase/functions/_shared/hebrew-asr-gradio.ts";

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

  it("tries ogg then opus filenames for WhatsApp PTT, not .oga", () => {
    const variants = asrUploadVariants("msg.ogg", "audio/ogg; codecs=opus", oggHeader());
    assert.deepEqual(
      variants.map((row) => row.fileName),
      ["audio.ogg", "audio.opus"],
    );
  });

  it("builds a Groq data URI from Ogg bytes", () => {
    const url = audioDataUrl(oggHeader(), "audio/ogg; codecs=opus");
    assert.match(url, /^data:audio\/ogg;base64,/);
    assert.ok(url.length > 40);
  });

  it("rejects Green-API downloadFile endpoints as public media URLs", () => {
    assert.equal(
      isPublicMediaUrl("https://api.green-api.com/waInstance123/downloadFile/token"),
      false,
    );
    assert.equal(
      isPublicMediaUrl("https://sw-media.storage.yandexcloud.net/1103912412/voice.ogg"),
      true,
    );
  });

  it("parses downloadFile JSON and raw OggS bodies", () => {
    const json = new TextEncoder().encode(
      JSON.stringify({ downloadUrl: "https://sw-media.storage.yandexcloud.net/a/voice.ogg" }),
    );
    assert.equal(
      parseGreenApiDownloadFileBody(json).downloadUrl,
      "https://sw-media.storage.yandexcloud.net/a/voice.ogg",
    );
    const ogg = parseGreenApiDownloadFileBody(oggHeader(), "application/octet-stream");
    assert.equal(ogg.bytes?.byteLength, 80);
    assert.equal(ogg.mimeType, "audio/ogg");
  });

  it("parses Gradio SSE transcription text", () => {
    const sse =
      'event: complete\ndata: ["בבי מה המשימות היום", "transcribing audio"]\n\n';
    assert.equal(parseGradioSseText(sse), "בבי מה המשימות היום");
  });
});
