import { currentAccessToken } from "./whatsapp-gateway";
import { requireSupabase } from "./supabase";

export interface TranscribeVoiceItemResult {
  ok: boolean;
  itemId: string;
  title: string;
  content: string;
  alreadyTranscribed?: boolean;
}

export async function invokeTranscribeVoiceItem(
  itemId: string,
): Promise<TranscribeVoiceItemResult> {
  const supabase = requireSupabase();
  const accessToken = await currentAccessToken();
  if (!accessToken) {
    throw new Error("Not authenticated");
  }
  const { data, error } = await supabase.functions.invoke("transcribe-voice-item", {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { itemId },
  });
  if (error) {
    throw new Error(error.message || "תמלול ההודעה הקולית נכשל");
  }
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(String((data as { error: string }).error));
  }
  const result = data as Partial<TranscribeVoiceItemResult> | null;
  const title = typeof result?.title === "string" ? result.title.trim() : "";
  if (!title) {
    throw new Error("transcription_empty");
  }
  return {
    ok: true,
    itemId: result?.itemId || itemId,
    title,
    content: typeof result?.content === "string" ? result.content : "",
    alreadyTranscribed: result?.alreadyTranscribed,
  };
}
