export interface GreenApiMediaCredentials {
  instanceId: string;
  apiToken: string;
  apiUrl: string;
}

export async function resolveGreenApiMediaUrl(params: {
  downloadUrl?: string | null;
  chatId?: string | null;
  messageId?: string | null;
  credentials?: GreenApiMediaCredentials | null;
}): Promise<string | null> {
  const existing = params.downloadUrl?.trim();
  if (existing && /^https?:\/\//i.test(existing)) {
    try {
      const head = await fetch(existing, { method: "GET" });
      if (head.ok) return existing;
    } catch {
      // fall through to downloadFile
    }
  }

  const chatId = params.chatId?.trim();
  const messageId = params.messageId?.trim();
  const creds = params.credentials;
  if (!chatId || !messageId || !creds?.instanceId || !creds.apiToken) {
    return existing && /^https?:\/\//i.test(existing) ? existing : null;
  }

  const base = (creds.apiUrl || "https://api.greenapi.com").replace(/\/$/, "");
  const url = `${base}/waInstance${creds.instanceId}/downloadFile/${creds.apiToken}`;
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
