import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { encodePcm16MonoWav, resampleLinear } from "./voice-wav.ts";

describe("whisper WAV encoder", () => {
  it("writes a valid 16-bit mono RIFF header", () => {
    const samples = new Float32Array(16);
    samples[0] = 0.5;
    samples[1] = -0.5;
    const wav = encodePcm16MonoWav(samples, 16_000);
    const header = new TextDecoder().decode(wav.subarray(0, 12));
    assert.equal(header.slice(0, 4), "RIFF");
    assert.equal(header.slice(8, 12), "WAVE");
    assert.equal(wav.byteLength, 44 + samples.length * 2);
    const view = new DataView(wav.buffer);
    assert.equal(view.getUint16(22, true), 1);
    assert.equal(view.getUint32(24, true), 16_000);
    assert.equal(view.getUint16(34, true), 16);
  });

  it("resamples without changing length when rates match", () => {
    const input = new Float32Array([0, 0.2, 0.4, 0.6]);
    const out = resampleLinear(input, 16_000, 16_000);
    assert.deepEqual(Array.from(out), Array.from(input));
  });
});
