import {
  isLikelyAudioBytes,
  isPublicMediaUrl,
  mimeForContainer,
  sniffAudioContainer,
} from "./audio-format.ts";

export interface GreenApiMediaCredentials {
  instanceId: string;
  apiToken: string;
  apiUrl: string;
}

export interface GreenApiDownloadedFile {
  bytes?: Uint8Array;
  mimeType?: string;
  downloadUrl?: string;
}

function extractDownloadUrl(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["downloadUrl", "download_url", "url"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate.trim())) {
      return candidate.trim();
    }
  }
  if (record.data && typeof record.data === "object") {
    return extractDownloadUrl(record.data);
  }
  return undefined;
}

/** Green-API downloadFile may return JSON `{downloadUrl}` or the audio bytes. */
export function parseGreenApiDownloadFileBody(
  bytes: Uint8Array,
  contentType = "",
): GreenApiDownloadedFile {
  if (isLikelyAudioBytes(bytes)) {
    return {
      bytes,
      mimeType: mimeForContainer(sniffAudioContainer(bytes), contentType || "audio/ogg"),
    };
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  try {
    const parsed: unknown = JSON.parse(text);
    const downloadUrl = extractDownloadUrl(parsed);
    if (downloadUrl) return { downloadUrl };
  } catch {
    // not JSON
  }
  return {};
}

export async function requestGreenApiDownloadFile(params: {
  chatId?: string | null;
  messageId?: string | null;
  credentials?: GreenApiMediaCredentials | null;
}): Promise<GreenApiDownloadedFile | null> {
  const chatId = params.chatId?.trim();
  const messageId = params.messageId?.trim();
  const creds = params.credentials;
  if (!chatId || !messageId || !creds?.instanceId || !creds.apiToken) {
    return null;
  }

  const base = (creds.apiUrl || "https://api.green-api.com").replace(/\/$/, "");
  const url = `${base}/waInstance${creds.instanceId}/downloadFile/${creds.apiToken}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, audio/*, application/octet-stream, */*",
      },
      body: JSON.stringify({ chatId, idMessage: messageId }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const parsed = parseGreenApiDownloadFileBody(
      bytes,
      response.headers.get("content-type") || "",
    );
    if (parsed.bytes || parsed.downloadUrl) {
      return parsed.bytes
        ? { ...parsed, downloadUrl: parsed.downloadUrl ?? url }
        : parsed;
    }
  } catch {
    // keep falling back
  }
  return null;
}

export async function resolveGreenApiMediaUrl(params: {
  downloadUrl?: string | null;
  chatId?: string | null;
  messageId?: string | null;
  credentials?: GreenApiMediaCredentials | null;
  preferApi?: boolean;
}): Promise<string | null> {
  const existing = params.downloadUrl?.trim();
  if (!params.preferApi && existing && isPublicMediaUrl(existing)) {
    return existing;
  }

  const downloaded = await requestGreenApiDownloadFile(params);
  if (downloaded?.downloadUrl) return downloaded.downloadUrl;
  if (existing && /^https?:\/\//i.test(existing)) return existing;
  return null;
}
