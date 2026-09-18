/**
 * Convert browser MediaRecorder output into 16 kHz mono PCM WAV.
 * Groq/OpenAI Whisper reject many Chrome webm/opus captures as "unrecognized file format".
 */

const TARGET_SAMPLE_RATE = 16_000;

export function mixToMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  if (channels <= 1) {
    return buffer.getChannelData(0).slice();
  }
  const mixed = new Float32Array(length);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      mixed[i] += data[i] ?? 0;
    }
  }
  const scale = 1 / channels;
  for (let i = 0; i < length; i += 1) {
    mixed[i] *= scale;
  }
  return mixed;
}

export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (!Number.isFinite(fromRate) || fromRate <= 0 || fromRate === toRate) {
    return input;
  }
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const src = i * ratio;
    const left = Math.floor(src);
    const right = Math.min(left + 1, input.length - 1);
    const frac = src - left;
    const a = input[left] ?? 0;
    const b = input[right] ?? a;
    output[i] = a + (b - a) * frac;
  }
  return output;
}

export function encodePcm16MonoWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const rate = Math.round(sampleRate);
  const dataSize = samples.length * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);

  function writeString(offset: number, value: string): void {
    for (let i = 0; i < value.length; i += 1) {
      bytes[offset + i] = value.charCodeAt(i);
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return bytes;
}

export function wavBytesToBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: "audio/wav" });
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof AudioContext !== "undefined") return AudioContext;
  const host = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  return host.webkitAudioContext ?? null;
}

export async function blobToWhisperWav(blob: Blob): Promise<{
  blob: Blob;
  mimeType: string;
  fileName: string;
  converted: boolean;
}> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) {
    return { blob, mimeType: blob.type || "audio/webm", fileName: "recording.webm", converted: false };
  }
  let ctx: AudioContext | null = null;
  try {
    ctx = new Ctor();
    const decoded = await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const mono = mixToMono(decoded);
    const resampled = resampleLinear(mono, decoded.sampleRate, TARGET_SAMPLE_RATE);
    if (resampled.length < 160) {
      throw new Error("audio_too_short");
    }
    const wav = encodePcm16MonoWav(resampled, TARGET_SAMPLE_RATE);
    return {
      blob: wavBytesToBlob(wav),
      mimeType: "audio/wav",
      fileName: "recording.wav",
      converted: true,
    };
  } catch {
    return {
      blob,
      mimeType: blob.type || "audio/webm",
      fileName: "recording.webm",
      converted: false,
    };
  } finally {
    if (ctx) {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
  }
}
