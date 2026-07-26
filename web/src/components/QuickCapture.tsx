import { FormEvent, useEffect, useRef, useState } from "react";
import { formatIngestError, ingestTextForUser } from "../lib/ingest-text";
import {
  ingestImageBlobForUser,
  ingestVoiceBlobForUser,
  isWebMediaCaptureSupported,
  pickSupportedAudioMimeType,
} from "../lib/ingest-media";
import { MindTaskerLogo } from "./MindTaskerLogo";
import { NotebookIcon } from "./NotebookIcons";

const MAX_RECORD_SECONDS = 60;

interface QuickCaptureProps {
  userId: string;
  onCaptured?: () => void;
  variant?: "compact" | "scrapbook";
}

export function QuickCapture({ userId, onCaptured, variant = "compact" }: QuickCaptureProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordSecondsRef = useRef(0);
  const stoppingRef = useRef(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const mediaSupported = isWebMediaCaptureSupported();

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function clearRecordTimer() {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }

  function stopMediaTracks() {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isRecording || loading) return;
    const trimmed = text.trim();
    if (trimmed.length < 3) return;

    setLoading(true);
    setError(null);

    try {
      await ingestTextForUser(userId, trimmed);
      setText("");
      onCaptured?.();
    } catch (err) {
      setError(formatIngestError(err));
    } finally {
      setLoading(false);
    }
  }

  async function startRecording() {
    if (!mediaSupported) {
      setError("הדפדפן לא תומך בהקלטה מהמיקרופון");
      return;
    }
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;

    const mimeType = pickSupportedAudioMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    mediaRecorderRef.current = recorder;
    recorder.start(250);

    recordSecondsRef.current = 0;
    setRecordSeconds(0);
    setIsRecording(true);
    clearRecordTimer();
    recordTimerRef.current = setInterval(() => {
      recordSecondsRef.current += 1;
      setRecordSeconds(recordSecondsRef.current);
      if (recordSecondsRef.current >= MAX_RECORD_SECONDS) {
        void stopRecording(true);
      }
    }, 1000);
  }

  async function stopRecording(upload: boolean) {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    clearRecordTimer();

    const recorder = mediaRecorderRef.current;
    const elapsedSeconds = recordSecondsRef.current;
    mediaRecorderRef.current = null;
    setIsRecording(false);

    let blob: Blob | null = null;
    if (recorder) {
      blob = await new Promise<Blob | null>((resolve) => {
        recorder.onstop = () => {
          const type = recorder.mimeType || pickSupportedAudioMimeType() || "audio/webm";
          const parts = chunksRef.current;
          chunksRef.current = [];
          resolve(parts.length > 0 ? new Blob(parts, { type }) : null);
        };
        try {
          if (recorder.state !== "inactive") recorder.stop();
          else resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    stopMediaTracks();
    recordSecondsRef.current = 0;
    setRecordSeconds(0);

    if (!upload) {
      stoppingRef.current = false;
      return;
    }
    if (!blob || blob.size < 64) {
      stoppingRef.current = false;
      setError("ההקלטה ריקה");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await ingestVoiceBlobForUser(userId, blob, {
        mimeType: blob.type || "audio/webm",
        durationSeconds: Math.max(1, elapsedSeconds || 1),
      });
      onCaptured?.();
    } catch (err) {
      setError(formatIngestError(err));
    } finally {
      setLoading(false);
      stoppingRef.current = false;
    }
  }

  async function handleRecordPress() {
    if (loading || stoppingRef.current) return;
    try {
      if (isRecording) {
        await stopRecording(true);
      } else {
        stoppingRef.current = false;
        await startRecording();
      }
    } catch (err) {
      clearRecordTimer();
      stopMediaTracks();
      mediaRecorderRef.current = null;
      setIsRecording(false);
      recordSecondsRef.current = 0;
      setRecordSeconds(0);
      stoppingRef.current = false;
      const message =
        err instanceof Error && /NotAllowedError|Permission/i.test(err.name + err.message)
          ? "אפשר גישה למיקרופון כדי להקליט"
          : formatIngestError(err);
      setError(message);
    }
  }

  async function handleImageSelected(file: File | undefined) {
    if (!file || loading || isRecording) return;
    setLoading(true);
    setError(null);
    try {
      await ingestImageBlobForUser(userId, file, {
        mimeType: file.type || "image/jpeg",
      });
      onCaptured?.();
    } catch (err) {
      setError(formatIngestError(err));
    } finally {
      setLoading(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }

  const canSubmit = text.trim().length >= 3 && !isRecording;
  const recordLabel =
    recordSeconds >= 60
      ? `${Math.floor(recordSeconds / 60)}:${String(recordSeconds % 60).padStart(2, "0")}`
      : `0:${String(recordSeconds % 60).padStart(2, "0")}`;

  const mediaButtons = (
    <div className="quick-capture-media flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => void handleRecordPress()}
        disabled={loading || (!mediaSupported && !isRecording)}
        aria-label={isRecording ? "עצור הקלטה" : "הקלטה קולית"}
        title={isRecording ? `מקליט ${recordLabel}` : "הקלטה קולית"}
        className={`quick-capture-media-btn flex h-9 w-9 items-center justify-center rounded-lg outline-none transition disabled:opacity-45 sm:h-10 sm:w-10 ${
          isRecording
            ? "bg-red-500 text-white shadow-sm"
            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
        }`}
      >
        {isRecording ? (
          <span className="text-[10px] font-bold tabular-nums leading-none">{recordLabel}</span>
        ) : (
          <NotebookIcon name="mic" size={16} tone="slate" />
        )}
      </button>
      <button
        type="button"
        onClick={() => cameraInputRef.current?.click()}
        disabled={loading || isRecording}
        aria-label="סריקת תמונה"
        title="צלם או בחר תמונה"
        className="quick-capture-media-btn flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 text-stone-600 outline-none transition hover:bg-stone-200 disabled:opacity-45 sm:h-10 sm:w-10"
      >
        <NotebookIcon name="image" size={16} tone="slate" />
      </button>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleImageSelected(e.target.files?.[0])}
      />
    </div>
  );

  if (variant === "compact") {
    return (
      <form onSubmit={handleSubmit} className="quick-capture-header mx-auto w-full">
        <div className="quick-capture-header-box flex items-center gap-2 px-2 py-1.5 sm:gap-2.5 sm:px-2.5 sm:py-2">
          <button
            type="submit"
            disabled={loading || !canSubmit}
            aria-label="קלוט"
            title={canSubmit ? "קלוט" : "הקלד לפחות 3 תווים"}
            className="quick-capture-submit flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-2 outline-none disabled:cursor-not-allowed disabled:opacity-45 sm:px-3"
          >
            {loading ? (
              <MindTaskerLogo size="capture" variant="mark" thinking />
            ) : (
              <>
                <NotebookIcon name="plus" size={15} tone="white" />
                <span className="text-sm font-bold leading-none text-white">קלוט</span>
              </>
            )}
          </button>

          <div className="min-w-0 flex-1 text-right">
            <p className="quick-capture-kicker mb-0.5 hidden text-[10px] font-semibold leading-none text-orange-600/90 sm:text-[11px] lg:block">
              {isRecording ? `מקליט… ${recordLabel}` : "קליטה מהירה"}
            </p>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={isRecording ? "מקליט… לחץ שוב לעצירה" : "הוסף משימה, הערה או רעיון..."}
              dir="rtl"
              disabled={isRecording}
              className="quick-capture-input w-full !rounded-none !border-0 bg-transparent py-0.5 text-right text-sm leading-snug text-stone-800 shadow-none outline-none disabled:opacity-60 sm:text-base"
              aria-label="קליטה מהירה"
            />
          </div>

          {mediaButtons}
        </div>
        {error ? <p className="mt-1 px-1 text-[10px] text-red-600">{error}</p> : null}
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="scrapbook-capture mb-3 sm:mb-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="submit"
          disabled={loading || !canSubmit}
          aria-label="קלוט"
          title="קלוט"
          className="scrapbook-capture-submit flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white shadow-sm outline-none transition hover:bg-stone-50 disabled:opacity-45 sm:h-11 sm:w-11"
        >
          {loading ? (
            <MindTaskerLogo size="capture" variant="mark" thinking />
          ) : (
            <span className="text-xl font-light text-stone-500" aria-hidden>
              +
            </span>
          )}
        </button>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isRecording ? "מקליט… לחץ שוב לעצירה" : "הוסף משימה, הערה או רעיון..."}
          dir="rtl"
          disabled={isRecording}
          className="scrapbook-capture-input min-w-0 flex-1 !rounded-none !border-0 bg-transparent py-2 text-right text-base leading-snug shadow-none outline-none disabled:opacity-60 sm:text-lg"
          aria-label="קליטה מהירה"
        />
        {mediaButtons}
      </div>
      {error ? <p className="mt-1 px-1 text-[11px] text-red-600">{error}</p> : null}
    </form>
  );
}
