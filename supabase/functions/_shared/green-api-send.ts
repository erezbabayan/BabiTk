const DEFAULT_GREEN_URL = "https://api.greenapi.com";

export type GreenSendGateway = {
  instance_id: string;
  api_token: string;
  api_url?: string | null;
};

function greenUrl(gateway: GreenSendGateway, method: string): string {
  const base = (gateway.api_url ?? DEFAULT_GREEN_URL).replace(/\/$/, "") || DEFAULT_GREEN_URL;
  return `${base}/waInstance${gateway.instance_id}/${method}/${gateway.api_token}`;
}

export async function sendGreenApiText(
  gateway: GreenSendGateway | null,
  chatId: string,
  message: string,
): Promise<boolean> {
  if (!gateway?.instance_id || !gateway.api_token || !chatId.trim() || !message.trim()) {
    return false;
  }
  const response = await fetch(greenUrl(gateway, "sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("green-api send failed", response.status, body);
    return false;
  }
  return true;
}
