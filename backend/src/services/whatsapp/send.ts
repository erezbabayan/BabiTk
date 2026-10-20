import { env } from "../../config/env.js";
import type { WhatsAppProviderId } from "../../types/whatsapp.js";
import { createGreenApiProvider } from "./outbound.js";
import { phoneFromWhatsAppId } from "./phone.js";

function digitsOnly(phone: string): string {
  return phoneFromWhatsAppId(phone).replace(/\D/g, "");
}

async function sendViaMeta(to: string, body: string): Promise<void> {
  if (!env.whatsappAccessToken || !env.whatsappPhoneNumberId) {
    throw new Error("WhatsApp Meta API is not configured");
  }

  const response = await fetch(
    `https://graph.facebook.com/${env.whatsappGraphApiVersion}/${env.whatsappPhoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.whatsappAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: digitsOnly(to),
        type: "text",
        text: { body },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp send failed: ${response.status} ${errorBody}`);
  }
}

async function sendViaWhapi(to: string, body: string): Promise<void> {
  if (!env.whapiApiToken) {
    throw new Error("Whapi is not configured");
  }

  const response = await fetch("https://gate.whapi.cloud/messages/text", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${env.whapiApiToken}`,
    },
    body: JSON.stringify({
      to: digitsOnly(to),
      body,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Whapi send failed: ${response.status} ${errorBody}`);
  }
}

export async function sendWhatsAppText(
  to: string,
  body: string,
  provider: WhatsAppProviderId = env.whatsappProvider,
): Promise<void> {
  switch (provider) {
    case "green-api":
      await createGreenApiProvider().send({ to, body });
      return;
    case "whapi":
      await sendViaWhapi(to, body);
      return;
    case "meta":
    default:
      await sendViaMeta(to, body);
  }
}
