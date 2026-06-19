import { normalizePhone } from "./phone";

function digitsOnly(phone: string): string {
  return normalizePhone(phone).replace(/\D/g, "");
}

export function isGreenApiSendConfigured(): boolean {
  return Boolean(
    process.env.GREEN_API_INSTANCE_ID?.trim() &&
      process.env.GREEN_API_TOKEN?.trim(),
  );
}

/** Send outbound WhatsApp text via Green-API. */
export async function sendGreenApiText(toPhone: string, body: string): Promise<void> {
  const instanceId = process.env.GREEN_API_INSTANCE_ID?.trim();
  const token = process.env.GREEN_API_TOKEN?.trim();
  const baseUrl = (process.env.GREEN_API_URL ?? "https://api.green-api.com").replace(
    /\/$/,
    "",
  );

  if (!instanceId || !token) {
    throw new Error("Green-API send is not configured (GREEN_API_INSTANCE_ID / GREEN_API_TOKEN)");
  }

  const url = `${baseUrl}/waInstance${instanceId}/sendMessage/${token}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId: `${digitsOnly(toPhone)}@c.us`,
      message: body,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Green-API send failed: ${response.status} ${detail}`.trim());
  }
}
