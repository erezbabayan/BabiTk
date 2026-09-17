import { isUsableLiveTranscript, joinSpeechRecognitionTranscripts } from "./fast-voice-asr";

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0?: SpeechRecognitionAlternativeLike;
  length: number;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export interface LiveHebrewSpeechHandle {
  stop(): string;
}

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const host = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

export function isLiveHebrewSpeechSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

/**
 * Streaming on-device captions (Chrome/Edge Web Speech, he-IL).
 * Used as a live preview and as a fast fallback if Groq is unreachable.
 */
export function startLiveHebrewSpeech(
  onUpdate: (text: string) => void,
): LiveHebrewSpeechHandle | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = "he-IL";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  const finals: string[] = [];
  let interim = "";
  let stopped = false;

  const emit = () => {
    const text = joinSpeechRecognitionTranscripts([...finals, interim]);
    onUpdate(text);
  };

  recognition.onresult = (event) => {
    interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = result?.[0]?.transcript ?? "";
      if (!transcript.trim()) continue;
      if (result.isFinal) {
        finals.push(transcript);
      } else {
        interim = transcript;
      }
    }
    emit();
  };
  recognition.onerror = () => {
    // permission-denied / no-speech: keep recorder going; Groq still runs.
  };
  recognition.onend = () => {
    if (!stopped) {
      try {
        recognition.start();
      } catch {
        /* already stopped */
      }
    }
  };

  try {
    recognition.start();
  } catch {
    return null;
  }

  return {
    stop() {
      stopped = true;
      try {
        recognition.stop();
      } catch {
        try {
          recognition.abort();
        } catch {
          /* ignore */
        }
      }
      const text = joinSpeechRecognitionTranscripts([...finals, interim]);
      return isUsableLiveTranscript(text) ? text : "";
    },
  };
}
