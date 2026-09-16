/**
 * Hebrew ASR + linguistic proofread for the Green-API webhook.
 * Same rules as Convex/backend: transcribe, then fix spelling/ASR errors.
 */

import { titleFromInboundText } from "./voice-text.ts";

export const HEBREW_ASR_WHISPER_PROMPT =
  "עברית. שמות פרטיים נפוצים: רועי, נועם, אורי, גיא, עידו, עידן, מיכל, שירה, יעל, דנה, מאיה, הילה, אסף, ליאור, יונתן, דניאל, תום, רן, ניר, עומר, איתי, אביה, תמר, נועה, אביגיל.";

const HEBREW_ASR_NAME_FIXES: ReadonlyArray<readonly [wrong: string, right: string]> = [
  ["רואי", "רועי"],
  ["רועיי", "רועי"],
  ["גיי", "גיא"],
  ["אידו", "עידו"],
  ["אידן", "עידן"],
  ["איתיי", "איתי"],
  ["נועםם", "נועם"],
];

export const inboundHebrewProofreadPrompt = `אתה עורך לשוני לעברית מודרנית. תקן את הטקסט כך שיהיה כתוב נכון, ברור וקריא — בלי לשנות את כוונת הכותב.

הקלט יכול להגיע מהקלדה, וואטסאפ, תמלול קולי (ASR) או OCR. תקן:
1. שגיאות כתיב של מילים נפוצות
2. שגיאות תמלול קולי ברורות (הומופונים / מילים קרובות בצליל שנכתבו לא נכון)
3. **שמות פרטיים בעברית** — כתוב בכתיב הסטנדרטי של השם המיועד לפי ההקשר והצליל. דוגמאות תמלול נפוצות:
   - "רואי" → "רועי" (שם פרטי; לא "רואי")
   - "גיי" → "גיא"
   - "אידו" → "עידו", "אידן" → "עידן"
   אם ברור שזה שם אדם (אחרי ל/עם/של/אל/אצל וכו') — בחר את הכתיב העברי הנפוץ והנכון של אותו שם, לא את הכתיב השגוי מה־ASR
4. שגיאות פענוח OCR ברורות (למשל "בשעב" → "בשעה")
5. רווחים חסרים או מיותרים בין מילים
6. קיצורים נפוצים למילים מלאות כשברור מה הכוונה (למשל "בבקשה", "תזכורת")

כללים קשיחים:
- אל תוסיף מידע, משימות או פרטים שלא הופיעו בקלט
- אל תמחק תוכן משמעותי — רק תקן ניסוח/כתיב
- אל תחליף אדם באדם אחר — רק תקן כתיב של אותו שם
- אל תתרגם לאנגלית; השאר קודים, מספרי טלפון, URL ומייל כמו שהם
- שמור על מבנה השורות אם יש כמה שורות
- אם מילה לא ברורה — השאר כפי שהיא (או עם ? אם כבר היה)
- החזר רק את הטקסט המתוקן, בלי הסברים, בלי מרכאות ובלי JSON`;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceNameForm(text: string, wrong: string, right: string): string {
  const pattern = new RegExp(
    `(?<![\\u0590-\\u05FF])([לבכושה]{0,2})${escapeRegExp(wrong)}(?![\\u0590-\\u05FF])`,
    "g",
  );
  return text.replace(pattern, `$1${right}`);
}

export function applyHebrewAsrSpellingFixes(text: string): string {
  let out = text;
  for (const [wrong, right] of HEBREW_ASR_NAME_FIXES) {
    out = replaceNameForm(out, wrong, right);
  }
  return out;
}

export interface VoiceTranscription {
  rawText: string;
  correctedText: string;
  title: string;
}

export function audioFileName(messageId: string, mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime.includes("mpeg") || mime.includes("mp3")) return `${messageId}.mp3`;
  if (mime.includes("mp4") || mime.includes("m4a")) return `${messageId}.m4a`;
  if (mime.includes("wav")) return `${messageId}.wav`;
  if (mime.includes("webm")) return `${messageId}.webm`;
  return `${messageId}.ogg`;
}

async function transcribeWithProvider(
  url: string,
  apiKey: string,
  model: string,
  audio: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mimeType }), fileName);
  form.append("model", model);
  form.append("language", "he");
  form.append("prompt", HEBREW_ASR_WHISPER_PROMPT);
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ASR HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as { text?: string };
  const text = data.text?.trim() ?? "";
  if (!text) {
    throw new Error("empty_transcription");
  }
  return text;
}

async function transcribeAudio(audio: Uint8Array, fileName: string, mimeType: string): Promise<string> {
  const groqKey = Deno.env.get("GROQ_API_KEY")?.trim();
  const openAiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
  const groqModel = Deno.env.get("GROQ_WHISPER_MODEL")?.trim() || "whisper-large-v3-turbo";
  const openAiModel = Deno.env.get("OPENAI_WHISPER_MODEL")?.trim() || "whisper-1";
  const errors: string[] = [];

  if (groqKey) {
    try {
      return await transcribeWithProvider(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        groqKey,
        groqModel,
        audio,
        fileName,
        mimeType,
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "groq_failed");
    }
  }

  if (openAiKey) {
    try {
      return await transcribeWithProvider(
        "https://api.openai.com/v1/audio/transcriptions",
        openAiKey,
        openAiModel,
        audio,
        fileName,
        mimeType,
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "openai_failed");
    }
  }

  throw new Error(
    errors.length > 0
      ? `transcription_failed: ${errors.join("; ")}`
      : "missing_asr_keys",
  );
}

async function proofreadHebrew(text: string): Promise<string> {
  const trimmed = applyHebrewAsrSpellingFixes(text.trim());
  if (trimmed.length < 3) return trimmed;

  const openAiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
  const groqKey = Deno.env.get("GROQ_API_KEY")?.trim();
  const parseModel = Deno.env.get("OPENAI_PARSE_MODEL")?.trim() || "gpt-4o-mini";
  const groqChatModel = Deno.env.get("GROQ_CHAT_MODEL")?.trim() || "llama-3.3-70b-versatile";

  async function complete(url: string, apiKey: string, model: string): Promise<string | null> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: inboundHebrewProofreadPrompt },
          { role: "user", content: trimmed },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() || null;
  }

  try {
    if (openAiKey) {
      const corrected = await complete(
        "https://api.openai.com/v1/chat/completions",
        openAiKey,
        parseModel,
      );
      if (corrected) return applyHebrewAsrSpellingFixes(corrected);
    }
    if (groqKey) {
      const corrected = await complete(
        "https://api.groq.com/openai/v1/chat/completions",
        groqKey,
        groqChatModel,
      );
      if (corrected) return applyHebrewAsrSpellingFixes(corrected);
    }
  } catch {
    // Keep the lexicon-fixed transcription if proofread is unavailable.
  }
  return trimmed;
}

export async function transcribeAndProofreadVoice(params: {
  audio: Uint8Array;
  mimeType: string;
  fileName: string;
}): Promise<VoiceTranscription> {
  const rawText = applyHebrewAsrSpellingFixes(
    await transcribeAudio(params.audio, params.fileName, params.mimeType),
  );
  const correctedText = await proofreadHebrew(rawText);
  if (!correctedText.trim()) {
    throw new Error("empty_transcription");
  }
  return {
    rawText,
    correctedText,
    title: titleFromInboundText(correctedText),
  };
}

export async function downloadAudioBytes(url: string): Promise<{
  bytes: Uint8Array;
  mimeType: string;
}> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`audio_download_failed:${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 64) {
    throw new Error("audio_too_short");
  }
  return {
    bytes,
    mimeType: response.headers.get("content-type") || "audio/ogg",
  };
}
