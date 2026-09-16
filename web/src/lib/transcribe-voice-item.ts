import { currentAccessToken } from "./whatsapp-gateway";
import { requireSupabase } from "./supabase";

export interface TranscribeVoiceItemResult {
  ok: boolean;
  itemId: string;
  title: string;
  content: string;
  alreadyTranscribed?: boolean;
}

function parseTranscribePayload(
  data: unknown,
  itemId: string,
): TranscribeVoiceItemResult | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if ("stateInstance" in record || "qrBase64" in record) return null;
  if (typeof record.error === "string" && record.error.length > 0) {
    throw new Error(record.error);
  }
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title) return null;
  return {
    ok: true,
    itemId: typeof record.itemId === "string" ? record.itemId : itemId,
    title,
    content: typeof record.content === "string" ? record.content : "",
    alreadyTranscribed: record.alreadyTranscribed === true,
  };
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

export async function invokeTranscribeVoiceItem(
  itemId: string,
): Promise<TranscribeVoiceItemResult> {
  const supabase = requireSupabase();
  const accessToken = await currentAccessToken();
  if (!accessToken) {
    throw new Error("Not authenticated");
  }
  const headers = { Authorization: `Bearer ${accessToken}` };

  const connect = await invokeWithTimeout(
    supabase.functions.invoke("whatsapp-green-connect", {
      headers,
      body: { action: "transcribeItem", itemId },
    }),
    20_000,
  );
  if (!connect.error) {
    const parsed = parseTranscribePayload(connect.data, itemId);
    if (parsed) return parsed;
  }

  const dedicated = await invokeWithTimeout(
    supabase.functions.invoke("transcribe-voice-item", {
      headers,
      body: { itemId },
    }),
    20_000,
  );
  if (dedicated.error) {
    throw new Error(dedicated.error.message || "תמלול ההודעה הקולית נכשל");
  }
  const parsed = parseTranscribePayload(dedicated.data, itemId);
  if (parsed) return parsed;
  throw new Error("transcription_empty");
}
