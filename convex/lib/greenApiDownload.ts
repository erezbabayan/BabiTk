import {
  greenApiCredentialsFromEnv,
  type GreenApiCredentials,
} from "./greenApiSend";

/**
 * Resolve a downloadable media URL for a Green-API message.
 * Prefer an existing downloadUrl; fall back to downloadFile(chatId, idMessage).
 */
export async function resolveGreenApiMediaUrl(params: {
  downloadUrl?: string | null;
  chatId?: string | null;
  messageId?: string | null;
  credentials?: GreenApiCredentials | null;
}): Promise<string | null> {
  const existing = params.downloadUrl?.trim();
  if (existing && /^https?:\/\//i.test(existing)) {
    // Quick probe — expired DigitalOcean URLs → fetch downloadFile.
    try {
      const head = await fetch(existing, { method: "GET" });
      if (head.ok) return existing;
    } catch {
      // fall through
    }
  }

  const chatId = params.chatId?.trim();
  const messageId = params.messageId?.trim();
  if (!chatId || !messageId) {
    return existing && /^https?:\/\//i.test(existing) ? existing : null;
  }

  const creds = params.credentials ?? greenApiCredentialsFromEnv();
  if (!creds) {
    return existing && /^https?:\/\//i.test(existing) ? existing : null;
  }

  const base = creds.baseUrl.replace(/\/$/, "");
  const url = `${base}/waInstance${creds.instanceId}/downloadFile/${creds.token}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, idMessage: messageId }),
    });
    if (!response.ok) {
      return existing && /^https?:\/\//i.test(existing) ? existing : null;
    }
    const body = (await response.json()) as { downloadUrl?: string };
    const resolved = body.downloadUrl?.trim();
    if (resolved) return resolved;
  } catch {
    // keep falling back
  }

  return existing && /^https?:\/\//i.test(existing) ? existing : null;
}
