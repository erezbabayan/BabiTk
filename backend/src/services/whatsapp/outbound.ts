import { env } from "../../config/env.js";
import { resolveGreenApiChatId } from "../../lib/whatsapp-reminder-message.js";

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
 * Feature code talks to this seam. The only implementation is Green-API.
 * Meta Cloud API is intentionally not wired here.
 */
export interface WhatsAppOutboundProvider {
  readonly id: "green-api";
  send(message: WhatsAppOutboundRequest): Promise<void>;
}

export type GreenApiCredentials = {
  instanceId: string;
  token: string;
  baseUrl?: string;
};

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

async function postJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Green-API send failed: ${response.status} ${detail}`.trim());
  }
}

/** Green-API text, with optional interactive buttons that fall back to the same text. */
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
          await postJson(`${baseUrl}/waInstance${instanceId}/sendInteractiveButtons/${token}`, {
            chatId,
            body: message.body,
            footer: "BabiTk",
            buttons: replies.map((reply) => ({
              buttonId: reply.id,
              buttonText: clipTitle(reply.title),
            })),
          });
          return;
        } catch {
          // Buttons are optional. The text reply hints still work.
        }
      }
      await postJson(`${baseUrl}/waInstance${instanceId}/sendMessage/${token}`, {
        chatId,
        message: `${message.body}${replyHint(replies)}`,
      });
    },
  };
}

export async function sendWhatsAppOutbound(
  message: WhatsAppOutboundRequest,
  green?: GreenApiCredentials | null,
): Promise<void> {
  await createGreenApiProvider(green).send(message);
}
