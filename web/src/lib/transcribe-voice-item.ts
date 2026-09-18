import {
  currentAccessToken,
  currentUserId,
  peekAccessToken,
} from "./whatsapp-gateway";
import { requireSupabase } from "./supabase";
import {
  transcribeHebrewAudioBlob,
  transcribeHebrewAudioUrl,
} from "../../../convex/lib/ingest/hebrewAsrPublicClient";
import {
  parseIncomingMessage,
  parsedItemInsertFields,
  resolveAllowedTagNames,
} from "./parse-incoming-message";
import { parseWhatsAppVoiceQuestion } from "../../../convex/lib/whatsappSystemQuestion";
import type { MindtaskerItem, SourceMaterial } from "../types";
import {
  canSendAudioToEdge,
  EDGE_INGEST_TIMEOUT_MS,
  EDGE_TRANSCRIBE_TIMEOUT_MS,
  isUsableLiveTranscript,
  parseEdgeVoicePayload,
} from "./fast-voice-asr";
import { titleFromInboundText, needsVoiceTranscription, VOICE_TRANSCRIBING_TITLE } from "./voice-text";

export interface TranscribeVoiceItemResult {
  ok: boolean;
  itemId: string;
  title: string;
  content: string;
  alreadyTranscribed?: boolean;
  answered?: boolean;
}

export type VoiceRepairItem = Pick<
  MindtaskerItem,
  "id" | "title" | "content" | "metadata" | "source_material_id"
> & {
  source_materials?: SourceMaterial | null | SourceMaterial[];
};

function parseTranscribePayload(
  data: unknown,
  itemId: string,
): TranscribeVoiceItemResult | null {
  return parseEdgeVoicePayload(data, itemId);
}

async function invokeWithTimeout<T>(
  work: Promise<T>,
  ms: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("transcription_timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

let cachedVoiceToken: string | null = null;

export async function prefetchVoiceAuth(): Promise<void> {
  cachedVoiceToken = await peekAccessToken();
}

async function voiceAccessToken(): Promise<string> {
  const token =
    cachedVoiceToken ?? (await peekAccessToken()) ?? (await currentAccessToken());
  if (!token) throw new Error("Not authenticated");
  cachedVoiceToken = token;
  return token;
}

async function invokeEdge(
  functionName: string,
  body: BodyInit,
  timeoutMs: number,
  contentType?: string,
): Promise<unknown> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
  const accessToken = await voiceAccessToken();
  if (!supabaseUrl) throw new Error("Supabase is not configured");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    apikey: anonKey || accessToken,
  };
  if (contentType) headers["Content-Type"] = contentType;

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/${functionName}`, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    const reason =
      (typeof record?.reason === "string" && record.reason) ||
      (typeof record?.error === "string" && record.error) ||
      `edge_http_${response.status}`;
    throw new Error(reason);
  }
  return data;
}

async function invokeEdgeJson(
  functionName: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  return invokeEdge(functionName, JSON.stringify(body), timeoutMs, "application/json");
}

async function invokeIngestVoice(params: {
  blob: Blob;
  mimeType: string;
  fileName: string;
  durationSeconds?: number;
  hintTranscript?: string;
  itemId?: string;
}): Promise<TranscribeVoiceItemResult | null> {
  const form = new FormData();
  form.append("file", params.blob, params.fileName);
  form.append("mimeType", params.mimeType);
  form.append("fileName", params.fileName);
  if (params.durationSeconds != null) {
    form.append("durationSeconds", String(params.durationSeconds));
  }
  if (params.hintTranscript?.trim()) {
    form.append("promptHint", params.hintTranscript.trim());
  }
  if (params.itemId) {
    form.append("itemId", params.itemId);
  }
  const data = await invokeEdge("ingest-voice", form, EDGE_INGEST_TIMEOUT_MS);
  return parseTranscribePayload(data, params.itemId ?? "");
}

function firstSource(item: VoiceRepairItem): SourceMaterial | null {
  const source = Array.isArray(item.source_materials)
    ? item.source_materials[0]
    : item.source_materials;
  return source ?? null;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

async function loadAllowedTagNamesForUser(userId: string): Promise<string[]> {
  try {
    const supabase = requireSupabase();
    const { data } = await supabase
      .from("user_tags")
      .select("name")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });
    return resolveAllowedTagNames(
      (data ?? []).map((row) => (typeof row.name === "string" ? row.name : "")),
    );
  } catch {
    return resolveAllowedTagNames([]);
  }
}

async function resolveAudioUrl(item: VoiceRepairItem): Promise<string | null> {
  const source = firstSource(item);
  const stored = source?.storage_url?.trim() ?? "";
  if (isHttpUrl(stored)) return stored;
  if (!stored || stored.includes("://") || !stored.includes("/")) return null;
  const supabase = requireSupabase();
  const { data, error } = await supabase.storage
    .from("source-materials")
    .createSignedUrl(stored, 180);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function tryReplyRecordedQuestion(params: {
  transcript: string;
  itemId?: string;
}): Promise<boolean> {
  const parsed = parseWhatsAppVoiceQuestion(params.transcript);
  if (!params.itemId && parsed.kind === "none") return false;
  try {
    const supabase = requireSupabase();
    const accessToken = await currentAccessToken();
    if (!accessToken) return parsed.kind !== "none";
    const invoked = await invokeWithTimeout(
      supabase.functions.invoke("whatsapp-green-connect", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          action: "replyVoiceQuestion",
          itemId: params.itemId,
          transcript: params.transcript,
        },
      }),
      8_000,
    );
    const data =
      invoked.data && typeof invoked.data === "object"
        ? (invoked.data as { answered?: unknown })
        : null;
    if (!invoked.error && data?.answered === true) return true;
  } catch {
    // Live connect may still be the old function.
  }
  return parsed.kind !== "none";
}

async function softDeleteQuestionItem(item: VoiceRepairItem, content: string): Promise<void> {
  const supabase = requireSupabase();
  const extraMeta = {
    ...(typeof item.metadata === "object" && item.metadata ? item.metadata : {}),
    whisper_transcription: content,
    corrected_transcription: content,
    system_question: true,
  };
  await supabase
    .from("mindtasker_items")
    .update({
      deleted_at: new Date().toISOString(),
      metadata: extraMeta,
      last_interacted_at: new Date().toISOString(),
    })
    .eq("id", item.id);
}

async function persistClientTranscript(
  item: VoiceRepairItem,
  title: string,
  content: string,
  engine: string,
): Promise<{ title: string; content: string }> {
  const supabase = requireSupabase();
  const userId = await currentUserId();
  const allowedTags = userId
    ? await loadAllowedTagNamesForUser(userId)
    : resolveAllowedTagNames([]);
  const parsed = parseIncomingMessage(content, { allowedTags })[0];
  const extraMeta = {
    ...(typeof item.metadata === "object" && item.metadata ? item.metadata : {}),
    whisper_transcription: content,
    corrected_transcription: content,
    asr_engine: engine,
  };
  const fields = parsed ? parsedItemInsertFields(parsed, extraMeta) : null;
  const nextTitle = fields?.title || title;
  const nextContent = fields?.content || content;
  const { error } = await supabase
    .from("mindtasker_items")
    .update({
      title: nextTitle,
      content: nextContent,
      is_actionable: fields?.is_actionable ?? true,
      due_date: fields?.due_date ?? null,
      tags: fields?.tags ?? [],
      metadata: fields?.metadata ?? extraMeta,
      last_interacted_at: new Date().toISOString(),
    })
    .eq("id", item.id);
  if (error) {
    throw new Error(error.message || "שמירת התמלול נכשלה");
  }
  const source = firstSource(item);
  if (!source?.id) return { title: nextTitle, content: nextContent };
  const sourceMeta =
    source.metadata && typeof source.metadata === "object"
      ? (source.metadata as Record<string, unknown>)
      : {};
  await supabase
    .from("source_materials")
    .update({
      raw_text: content,
      metadata: {
        ...sourceMeta,
        whisper_transcription: content,
        corrected_transcription: content,
        asr_engine: engine,
      },
    })
    .eq("id", source.id);
  return { title: nextTitle, content: nextContent };
}

async function transcribeViaPublicAsr(
  item: VoiceRepairItem,
): Promise<TranscribeVoiceItemResult> {
  const audioUrl = await resolveAudioUrl(item);
  if (!audioUrl) {
    throw new Error("voice_audio_url_missing");
  }
  let transcribed;
  try {
    transcribed = await transcribeHebrewAudioUrl(audioUrl);
  } catch {
    const direct = await fetch(audioUrl);
    if (!direct.ok) {
      throw new Error(`audio_download_failed:${direct.status}`);
    }
    const blob = await direct.blob();
    transcribed = await transcribeHebrewAudioBlob(blob, "whatsapp-voice.ogg");
  }
  const title = transcribed.title || titleFromInboundText(transcribed.correctedText);
  if (await tryReplyRecordedQuestion({ transcript: transcribed.correctedText, itemId: item.id })) {
    await softDeleteQuestionItem(item, transcribed.correctedText);
    return {
      ok: true,
      answered: true,
      itemId: item.id,
      title,
      content: transcribed.correctedText,
    };
  }
  const saved = await persistClientTranscript(
    item,
    title,
    transcribed.correctedText,
    transcribed.engine,
  );
  return {
    ok: true,
    itemId: item.id,
    title: saved.title,
    content: saved.content,
  };
}

export async function invokeTranscribeVoiceItem(
  item: VoiceRepairItem | string,
): Promise<TranscribeVoiceItemResult> {
  const itemId = typeof item === "string" ? item : item.id;

  try {
    const data = await invokeEdgeJson(
      "transcribe-voice-item",
      { itemId },
      EDGE_TRANSCRIBE_TIMEOUT_MS,
    );
    const parsed = parseTranscribePayload(data, itemId);
    if (parsed) return parsed;
  } catch {
    // Older deploys may only expose transcribeItem on connect.
  }

  const supabase = requireSupabase();
  const accessToken = await currentAccessToken();
  if (!accessToken) {
    throw new Error("Not authenticated");
  }
  const headers = { Authorization: `Bearer ${accessToken}` };

  try {
    const connect = await invokeWithTimeout(
      supabase.functions.invoke("whatsapp-green-connect", {
        headers,
        body: { action: "transcribeItem", itemId },
      }),
      12_000,
    );
    if (!connect.error) {
      const parsed = parseTranscribePayload(connect.data, itemId);
      if (parsed) return parsed;
    }
  } catch {
    // Live connect may still be the old QR-only function.
  }

  if (typeof item !== "string") {
    return transcribeViaPublicAsr(item);
  }
  throw new Error("תמלול ההודעה הקולית נכשל");
}

type PersistRecordingResult = TranscribeVoiceItemResult & { sourceId?: string };

async function persistClientRecording(
  userId: string,
  transcribed: {
    title: string;
    rawText: string;
    correctedText: string;
    engine: string;
  },
  durationSeconds?: number,
  options?: { skipQuestionIntercept?: boolean; skipParse?: boolean },
): Promise<PersistRecordingResult> {
  if (
    !options?.skipQuestionIntercept &&
    (await tryReplyRecordedQuestion({ transcript: transcribed.correctedText }))
  ) {
    return {
      ok: true,
      answered: true,
      itemId: "",
      title: transcribed.title,
      content: transcribed.correctedText,
    };
  }
  const supabase = requireSupabase();
  const shouldParse =
    !options?.skipParse &&
    transcribed.engine !== "pending" &&
    Boolean(transcribed.correctedText.trim());
  const parsed = shouldParse
    ? parseIncomingMessage(transcribed.correctedText, {
        allowedTags: await loadAllowedTagNamesForUser(userId),
      })[0]
    : undefined;
  const fields = parsed
    ? parsedItemInsertFields(parsed, {
        source: "app_voice",
        whisper_transcription: transcribed.rawText,
        corrected_transcription: transcribed.correctedText,
        asr_engine: transcribed.engine,
        duration_seconds: durationSeconds ?? null,
      })
    : null;
  const now = Date.now();
  const { data: source, error: sourceError } = await supabase
    .from("source_materials")
    .insert({
      user_id: userId,
      source_type: "whatsapp_voice",
      raw_text: transcribed.rawText,
      storage_url: null,
      metadata: {
        channel: "app",
        duration_seconds: durationSeconds ?? null,
        whisper_transcription: transcribed.rawText,
        corrected_transcription: transcribed.correctedText,
        asr_engine: transcribed.engine,
      },
    })
    .select("id")
    .single();
  if (sourceError) {
    throw new Error(sourceError.message);
  }
  const { data: inserted, error: itemError } = await supabase
    .from("mindtasker_items")
    .insert({
      user_id: userId,
      source_material_id: source?.id ?? null,
      title: fields?.title ?? transcribed.title,
      content: fields?.content ?? transcribed.correctedText,
      is_actionable: fields?.is_actionable ?? true,
      status: "inbox",
      due_date: fields?.due_date ?? null,
      tags: fields?.tags ?? [],
      metadata: fields?.metadata ?? {
        source: "app_voice",
        whisper_transcription: transcribed.rawText,
        corrected_transcription: transcribed.correctedText,
        asr_engine: transcribed.engine,
        duration_seconds: durationSeconds ?? null,
        voice_refine_pending: transcribed.engine === "pending" || transcribed.engine === "web-speech",
      },
      sort_order: now,
      last_interacted_at: new Date(now).toISOString(),
    })
    .select("id")
    .single();
  if (itemError || !inserted) {
    throw new Error(itemError?.message ?? "item_insert_failed");
  }
  return {
    ok: true,
    itemId: inserted.id as string,
    sourceId: typeof source?.id === "string" ? source.id : undefined,
    title: fields?.title ?? transcribed.title,
    content: fields?.content ?? transcribed.correctedText,
  };
}

async function attachRecordingAudio(params: {
  sourceId: string;
  userId: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
}): Promise<string | null> {
  try {
    const supabase = requireSupabase();
    const path = `${params.userId}/${Date.now()}-${params.fileName}`;
    const { error } = await supabase.storage.from("source-materials").upload(path, params.blob, {
      contentType: params.mimeType,
      upsert: false,
    });
    if (error) return null;
    await supabase.from("source_materials").update({ storage_url: path }).eq("id", params.sourceId);
    return path;
  } catch {
    return null;
  }
}

function isFinishedTranscript(result: TranscribeVoiceItemResult | null): boolean {
  if (!result?.ok) return false;
  if (result.answered) return true;
  return !needsVoiceTranscription(result.title, result.content);
}

async function refineRecordedVoiceInBackground(params: {
  userId: string;
  blob: Blob;
  mimeType: string;
  fileName: string;
  durationSeconds?: number;
  hintTranscript: string;
  itemId?: string;
  sourceId?: string;
}): Promise<TranscribeVoiceItemResult | null> {
  const storagePromise = params.sourceId
    ? attachRecordingAudio({
        sourceId: params.sourceId,
        userId: params.userId,
        blob: params.blob,
        fileName: params.fileName,
        mimeType: params.mimeType,
      })
    : Promise.resolve(null);

  if (canSendAudioToEdge(params.blob.size)) {
    try {
      const refined = await invokeIngestVoice({
        blob: params.blob,
        mimeType: params.mimeType,
        fileName: params.fileName,
        durationSeconds: params.durationSeconds,
        hintTranscript: params.hintTranscript,
        itemId: params.itemId,
      });
      if (isFinishedTranscript(refined)) {
        void storagePromise;
        return refined;
      }
    } catch {
      // Fall through to stored-item repair, then Gradio.
    }
  }

  const storagePath = await storagePromise;
  if (params.itemId && storagePath) {
    try {
      const repaired = await invokeTranscribeVoiceItem({
        id: params.itemId,
        title: VOICE_TRANSCRIBING_TITLE,
        content: "",
        metadata: { source: "app_voice", voice_storage_path: storagePath },
        source_material_id: params.sourceId ?? null,
        source_materials: params.sourceId
          ? {
              id: params.sourceId,
              source_type: "whatsapp_voice",
              storage_url: storagePath,
              raw_text: "",
            }
          : null,
      });
      if (isFinishedTranscript(repaired)) return repaired;
    } catch {
      // Last resort: public Gradio ASR.
    }
  }

  const transcribed = await transcribeHebrewAudioBlob(params.blob, params.fileName);
  if (params.itemId) {
    const saved = await persistClientTranscript(
      {
        id: params.itemId,
        title: VOICE_TRANSCRIBING_TITLE,
        content: "",
        metadata: { source: "app_voice" },
        source_material_id: params.sourceId ?? null,
        source_materials: params.sourceId
          ? {
              id: params.sourceId,
              source_type: "whatsapp_voice",
              storage_url: storagePath,
              raw_text: transcribed.rawText,
            }
          : null,
      },
      transcribed.title,
      transcribed.correctedText,
      transcribed.engine,
    );
    return {
      ok: true,
      itemId: params.itemId,
      title: saved.title,
      content: saved.content,
    };
  }
  return persistClientRecording(params.userId, {
    title: transcribed.title,
    rawText: transcribed.rawText,
    correctedText: transcribed.correctedText,
    engine: transcribed.engine,
  }, params.durationSeconds);
}

export async function persistRecordedVoiceTranscript(params: {
  blob: Blob;
  mimeType: string;
  fileName: string;
  durationSeconds?: number;
  hintTranscript?: string;
}): Promise<TranscribeVoiceItemResult> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Not authenticated");

  const hint = params.hintTranscript?.replace(/\s+/g, " ").trim() ?? "";
  const snapshot = isUsableLiveTranscript(hint)
    ? {
        title: titleFromInboundText(hint),
        rawText: hint,
        correctedText: hint,
        engine: "web-speech",
      }
    : {
        title: VOICE_TRANSCRIBING_TITLE,
        rawText: "",
        correctedText: "",
        engine: "pending",
      };

  let early: PersistRecordingResult | null = null;
  try {
    early = await persistClientRecording(userId, snapshot, params.durationSeconds, {
      skipQuestionIntercept: true,
      skipParse: true,
    });
  } catch {
    early = null;
  }

  const refine = refineRecordedVoiceInBackground({
    userId,
    blob: params.blob,
    mimeType: params.mimeType,
    fileName: params.fileName,
    durationSeconds: params.durationSeconds,
    hintTranscript: hint,
    itemId: early?.itemId,
    sourceId: early?.sourceId,
  });

  if (early) {
    void refine.catch(() => undefined);
    return early;
  }

  const refined = await refine;
  if (refined) return refined;
  throw new Error("תמלול ההקלטה נכשל");
}
