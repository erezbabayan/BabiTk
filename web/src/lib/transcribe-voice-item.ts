import { currentAccessToken, currentUserId } from "./whatsapp-gateway";
import { requireSupabase } from "./supabase";
import {
  transcribeHebrewAudioBlob,
  transcribeHebrewAudioUrl,
} from "../../../convex/lib/ingest/hebrewAsrPublicClient";
import { titleFromInboundText } from "./voice-text";
import {
  parseIncomingMessage,
  parsedItemInsertFields,
  resolveAllowedTagNames,
} from "./parse-incoming-message";
import { parseWhatsAppVoiceQuestion } from "../../../convex/lib/whatsappSystemQuestion";
import type { MindtaskerItem, SourceMaterial } from "../types";
import {
  blobToBase64,
  canSendAudioToEdge,
  EDGE_INGEST_TIMEOUT_MS,
  EDGE_TRANSCRIBE_TIMEOUT_MS,
  isUsableLiveTranscript,
  parseEdgeVoicePayload,
} from "./fast-voice-asr";

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

async function invokeEdgeJson(
  functionName: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
  const accessToken = await currentAccessToken();
  if (!accessToken) throw new Error("Not authenticated");
  if (!supabaseUrl) throw new Error("Supabase is not configured");

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey || accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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

async function persistClientRecording(
  userId: string,
  transcribed: {
    title: string;
    rawText: string;
    correctedText: string;
    engine: string;
  },
  durationSeconds?: number,
): Promise<TranscribeVoiceItemResult> {
  if (await tryReplyRecordedQuestion({ transcript: transcribed.correctedText })) {
    return {
      ok: true,
      answered: true,
      itemId: "",
      title: transcribed.title,
      content: transcribed.correctedText,
    };
  }
  const supabase = requireSupabase();
  const allowedTags = await loadAllowedTagNamesForUser(userId);
  const parsed = parseIncomingMessage(transcribed.correctedText, { allowedTags })[0];
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
    title: fields?.title ?? transcribed.title,
    content: fields?.content ?? transcribed.correctedText,
  };
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

  if (canSendAudioToEdge(params.blob.size)) {
    try {
      const audioBase64 = await blobToBase64(params.blob);
      const data = await invokeEdgeJson(
        "ingest-voice",
        {
          audioBase64,
          mimeType: params.mimeType,
          fileName: params.fileName,
          durationSeconds: params.durationSeconds,
          promptHint: params.hintTranscript?.trim() || undefined,
        },
        EDGE_INGEST_TIMEOUT_MS,
      );
      const parsed = parseTranscribePayload(data, "");
      if (parsed) return parsed;
    } catch {
      // Groq Edge unavailable — use live caption or Gradio.
    }
  }

  if (isUsableLiveTranscript(params.hintTranscript)) {
    const hint = params.hintTranscript!.replace(/\s+/g, " ").trim();
    return persistClientRecording(
      userId,
      {
        title: titleFromInboundText(hint),
        rawText: hint,
        correctedText: hint,
        engine: "web-speech",
      },
      params.durationSeconds,
    );
  }

  const transcribed = await transcribeHebrewAudioBlob(params.blob, params.fileName);
  return persistClientRecording(
    userId,
    {
      title: transcribed.title,
      rawText: transcribed.rawText,
      correctedText: transcribed.correctedText,
      engine: transcribed.engine,
    },
    params.durationSeconds,
  );
}
