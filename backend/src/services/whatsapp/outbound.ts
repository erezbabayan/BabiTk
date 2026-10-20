import { env } from "../../config/env.js";
import { resolveGreenApiChatId } from "../../lib/whatsapp-reminder-message.js";
import type { WhatsAppProviderId } from "../../types/whatsapp.js";

export type WhatsAppQuickReply = {
  id: string;
  title: string;
};

export type WhatsAppOutboundRequest = {
  to: string;
  body: string;
  quickReplies?: WhatsAppQuickReply[];
};

/**
 * Feature code talks only to this interface. Green-API and the official
 * WhatsApp Cloud API are interchangeable implementations.
 */
export interface WhatsAppOutboundProvider {
  readonly id: WhatsAppProviderId;
  send(message: WhatsAppOutboundRequest): Promise<void>;
}

export type GreenApiCredentials = {
  instanceId: string;
  token: string;
  baseUrl?: string;
};

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

function replyHint(replies: WhatsAppQuickReply[] | undefined): string {
  if (!replies || replies.length === 0) return "";
  const labels = replies.map((reply) => reply.title.trim()).filter(Boolean);
  if (labels.length === 0) return "";
  return `\n\n${labels.join(" · ")}`;
}

function clipTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed.length <= 20 ? trimmed : trimmed.slice(0, 20);
}

async function postJson(url: string, body: unknown, headers: Record<string, string>): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${response.status} ${detail}`.trim());
  }
}

export function createGreenApiProvider(credentials?: GreenApiCredentials | null): WhatsAppOutboundProvider {
  const instanceId = credentials?.instanceId?.trim() || env.greenApiInstanceId || "";
  const token = credentials?.token?.trim() || env.greenApiToken || "";
  const baseUrl = (credentials?.baseUrl || env.greenApiUrl || "https://api.greenapi.com").replace(/\/$/, "");

  return {
    id: "green-api",
    async send(message) {
      if (!instanceId || !token) {
        throw new Error("Green-API is not configured");
      }
      const chatId = resolveGreenApiChatId(message.to);
      const replies = (message.quickReplies ?? []).slice(0, 3).filter((reply) => reply.id && reply.title);
      if (replies.length > 0) {
        try {
          await postJson(
            `${baseUrl}/waInstance${instanceId}/sendInteractiveButtons/${token}`,
            {
              chatId,
              body: message.body,
              footer: "BabiTk",
              buttons: replies.map((reply) => ({
                buttonId: reply.id,
                buttonText: clipTitle(reply.title),
              })),
            },
            { "Content-Type": "application/json" },
          );
          return;
        } catch {
          // Interactive buttons are optional. The text reply hints still work.
        }
      }
      await postJson(
        `${baseUrl}/waInstance${instanceId}/sendMessage/${token}`,
        { chatId, message: `${message.body}${replyHint(replies)}` },
        { "Content-Type": "application/json" },
      );
    },
  };
}

export function createCloudApiProvider(): WhatsAppOutboundProvider {
  return {
    id: "meta",
    async send(message) {
      if (!env.whatsappAccessToken || !env.whatsappPhoneNumberId) {
        throw new Error("WhatsApp Meta API is not configured");
      }
      const url = `https://graph.facebook.com/${env.whatsappGraphApiVersion}/${env.whatsappPhoneNumberId}/messages`;
      const headers = {
        Authorization: `Bearer ${env.whatsappAccessToken}`,
        "Content-Type": "application/json",
      };
      const replies = (message.quickReplies ?? []).slice(0, 3).filter((reply) => reply.id && reply.title);
      const to = digitsOnly(message.to);
      if (replies.length > 0 && message.body.length <= 1024) {
        try {
          await postJson(
            url,
            {
              messaging_product: "whatsapp",
              to,
              type: "interactive",
              interactive: {
                type: "button",
                body: { text: message.body },
                action: {
                  buttons: replies.map((reply) => ({
                    type: "reply",
                    reply: { id: reply.id.slice(0, 256), title: clipTitle(reply.title) },
                  })),
                },
              },
            },
            headers,
          );
          return;
        } catch {
          // Fall through to a plain text message.
        }
      }
      await postJson(
        url,
        {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: `${message.body}${replyHint(replies)}` },
        },
        headers,
      );
    },
  };
}

export function createWhapiProvider(): WhatsAppOutboundProvider {
  return {
    id: "whapi",
    async send(message) {
      if (!env.whapiApiToken) throw new Error("Whapi is not configured");
      await postJson(
        "https://gate.whapi.cloud/messages/text",
        {
          to: digitsOnly(message.to),
          body: `${message.body}${replyHint(message.quickReplies)}`,
        },
        {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${env.whapiApiToken}`,
        },
      );
    },
  };
}

export function createWhatsAppOutboundProvider(
  provider: WhatsAppProviderId = env.whatsappProvider,
  green?: GreenApiCredentials | null,
): WhatsAppOutboundProvider {
  if (green?.instanceId && green.token) return createGreenApiProvider(green);
  switch (provider) {
    case "green-api":
      return createGreenApiProvider();
    case "whapi":
      return createWhapiProvider();
    case "meta":
    default:
      return createCloudApiProvider();
  }
}

export async function sendWhatsAppOutbound(
  message: WhatsAppOutboundRequest,
  provider?: WhatsAppProviderId,
  green?: GreenApiCredentials | null,
): Promise<void> {
  await createWhatsAppOutboundProvider(provider, green).send(message);
}
