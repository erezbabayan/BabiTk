import { resolveGreenApiChatId } from "../../lib/whatsapp-reminder-message.js";

export interface UserGreenApiGateway {
  instance_id: string;
  api_token: string;
  api_url: string;
}

export async function sendViaUserGreenApi(
  gateway: UserGreenApiGateway,
  toPhoneOrChatId: string,
  message: string,
): Promise<void> {
  const base = (gateway.api_url || "https://api.greenapi.com").replace(/\/$/, "");
  const url = `${base}/waInstance${gateway.instance_id}/sendMessage/${gateway.api_token}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId: resolveGreenApiChatId(toPhoneOrChatId),
      message,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Green-API send failed: ${response.status} ${detail}`.trim());
  }
}
