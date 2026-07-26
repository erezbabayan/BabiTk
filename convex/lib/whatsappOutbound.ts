import {
  CALLMEBOT_ACTIVATE_URL,
  resolveCallMeBotApiKey,
} from "./callMeBot";
import {
  fetchGreenApiSenderDigits,
  isGreenApiSendConfigured,
  isGreenApiSelfSend,
  sendGreenApiText,
  type GreenApiCredentials,
} from "./greenApiSend";
import { normalizePhone } from "./phone";

export type WhatsAppSendProvider = "green-api" | "meta" | "callmebot";

export type WhatsAppSendResult = {
  sent: boolean;
  provider?: WhatsAppSendProvider;
  reason?: string;
};

export { CALLMEBOT_ACTIVATE_URL };

function digitsOnly(phone: string): string {
  return normalizePhone(phone).replace(/\D/g, "");
}

function isMetaSendConfigured(): boolean {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "";
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "";
  if (!token || !phoneId) return false;
  if (token.length < 20) return false;
  if (phoneId === "1234567890") return false;
  if (/^your[-_]/i.test(token)) return false;
  return true;
}

async function sendViaMeta(toPhone: string, body: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const version = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v21.0";
  if (!token || !phoneId) {
    throw new Error("WhatsApp Meta API is not configured");
  }

  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: digitsOnly(toPhone),
        type: "text",
        text: { body },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`WhatsApp Meta send failed: ${response.status} ${detail}`.trim());
  }
}

export async function sendViaCallMeBot(
  toPhone: string,
  body: string,
  apiKey: string,
): Promise<void> {
  const key = apiKey.trim();
  if (!key) throw new Error("CallMeBot API key is empty");

  const url =
    "https://api.callmebot.com/whatsapp.php?" +
    new URLSearchParams({
      phone: digitsOnly(toPhone),
      text: body,
      apikey: key,
    }).toString();

  const response = await fetch(url);
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`CallMeBot send failed: ${response.status} ${text}`.trim());
  }
  // CallMeBot sometimes returns 200 with an error string.
  if (/apikey|invalid|error|denied/i.test(text) && !/success|queued|sent/i.test(text)) {
    throw new Error(`CallMeBot: ${text.slice(0, 200)}`);
  }
}

/**
 * Prefer CallMeBot when a personal key exists — it sends FROM the bot's number,
 * so WhatsApp shows a real incoming notification with sound (no second SIM needed).
 * Green-API / Meta follow as fallbacks.
 *
 * For quick-capture confirmations set `sameChat: true` + `chatId` so the reply
 * stays in the conversation where the user sent the item (never CallMeBot).
 */
export async function sendWhatsAppText(
  toPhone: string,
  message: string,
  options?: {
    callMeBotApiKey?: string | null;
    greenApiCredentials?: GreenApiCredentials | null;
    /** Exact WhatsApp chat to reply in (e.g. Message Yourself / group / peer). */
    chatId?: string | null;
    /** Force Green-API into `chatId` / toPhone — keep confirmation in-thread. */
    sameChat?: boolean;
  },
): Promise<WhatsAppSendResult> {
  const preferred = (process.env.WHATSAPP_PROVIDER ?? "").trim().toLowerCase();
  const greenCreds = options?.greenApiCredentials ?? null;
  const callMeKey = resolveCallMeBotApiKey(options?.callMeBotApiKey);
  const replyTarget = options?.chatId?.trim() || toPhone;

  // Ingest confirmations: always answer in the same chat via Green-API.
  if (options?.sameChat) {
    if (!isGreenApiSendConfigured(greenCreds)) {
      return { sent: false, reason: "green_api_send_not_configured" };
    }
    try {
      await sendGreenApiText(replyTarget, message, greenCreds);
      return { sent: true, provider: "green-api" };
    } catch (error) {
      return {
        sent: false,
        provider: "green-api",
        reason: error instanceof Error ? error.message : "green_api_send_failed",
      };
    }
  }

  const tryGreen = preferred === "green-api" || preferred === "" || preferred === "auto";
  const tryMeta = preferred === "meta" || preferred === "" || preferred === "auto";
  // Always try CallMeBot when a key exists — digests need an audible path even if
  // WHATSAPP_PROVIDER=green-api (same-number Green sends are silent / quota-blocked).
  const tryCallMe =
    Boolean(callMeKey) &&
    (preferred === "callmebot" ||
      preferred === "" ||
      preferred === "auto" ||
      preferred === "green-api");

  let lastFailureReason: string | undefined;

  if (tryCallMe && callMeKey) {
    try {
      await sendViaCallMeBot(toPhone, message, callMeKey);
      return { sent: true, provider: "callmebot" };
    } catch (error) {
      lastFailureReason =
        error instanceof Error ? error.message : "callmebot_send_failed";
      if (preferred === "callmebot") {
        return {
          sent: false,
          provider: "callmebot",
          reason: lastFailureReason,
        };
      }
      // Fall through to Green/Meta when auto / green-api.
    }
  }

  // Digests / alerts: never "succeed" via Green-API when the instance phone is the
  // recipient — WhatsApp treats it as a silent self-message (user only sees in-app).
  let greenIsSelfSend = false;
  if (tryGreen && isGreenApiSendConfigured(greenCreds) && !options?.sameChat) {
    const senderDigits = await fetchGreenApiSenderDigits(greenCreds);
    greenIsSelfSend = isGreenApiSelfSend(
      senderDigits,
      options?.chatId?.trim() || toPhone,
    );
  }

  if (tryGreen && isGreenApiSendConfigured(greenCreds) && !greenIsSelfSend) {
    try {
      await sendGreenApiText(options?.chatId?.trim() || toPhone, message, greenCreds);
      return { sent: true, provider: "green-api" };
    } catch (error) {
      lastFailureReason =
        error instanceof Error ? error.message : "green_api_send_failed";
      if (preferred === "green-api" && !callMeKey) {
        return {
          sent: false,
          provider: "green-api",
          reason: lastFailureReason,
        };
      }
    }
  }

  if (greenIsSelfSend && !callMeKey) {
    return {
      sent: false,
      reason: "green_api_same_number_use_callmebot",
    };
  }

  if (tryMeta && isMetaSendConfigured()) {
    try {
      await sendViaMeta(toPhone, message);
      return { sent: true, provider: "meta" };
    } catch (error) {
      lastFailureReason =
        error instanceof Error ? error.message : "meta_send_failed";
      if (preferred === "meta") {
        return {
          sent: false,
          provider: "meta",
          reason: lastFailureReason,
        };
      }
    }
  }

  if (preferred === "meta" && !lastFailureReason) {
    return { sent: false, reason: "meta_send_not_configured" };
  }
  if (preferred === "callmebot" && !callMeKey) {
    return { sent: false, reason: "callmebot_key_missing" };
  }
  if (lastFailureReason) {
    return {
      sent: false,
      provider: callMeKey ? "callmebot" : tryGreen ? "green-api" : undefined,
      reason: lastFailureReason,
    };
  }
  return {
    sent: false,
    reason: callMeKey
      ? "whatsapp_send_failed"
      : greenIsSelfSend
        ? "green_api_same_number_use_callmebot"
        : "whatsapp_send_not_configured",
  };
}

export function getWhatsAppSendStatus(options?: {
  greenConfigured?: boolean;
}): {
  provider: "green-api" | "meta" | "callmebot" | "none";
  configured: boolean;
  greenConfigured: boolean;
  metaConfigured: boolean;
  hint: string;
} {
  const greenConfigured =
    options?.greenConfigured ?? isGreenApiSendConfigured();
  const metaConfigured = isMetaSendConfigured();
  const preferred = (process.env.WHATSAPP_PROVIDER ?? "auto").trim().toLowerCase();

  if (preferred === "green-api") {
    return {
      provider: "green-api",
      configured: greenConfigured,
      greenConfigured,
      metaConfigured,
      hint: greenConfigured
        ? "שליחה דרך Green-API"
        : "חסר Green-API — הזן Instance ID + Token בהגדרות וואטסאפ",
    };
  }
  if (preferred === "meta") {
    return {
      provider: "meta",
      configured: metaConfigured,
      greenConfigured,
      metaConfigured,
      hint: metaConfigured
        ? "שליחה דרך Meta Cloud API"
        : "חסר WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID תקינים ב-Convex",
    };
  }

  if (greenConfigured) {
    return {
      provider: "green-api",
      configured: true,
      greenConfigured,
      metaConfigured,
      hint: "שליחה דרך Green-API",
    };
  }
  if (metaConfigured) {
    return {
      provider: "meta",
      configured: true,
      greenConfigured,
      metaConfigured,
      hint: "שליחה דרך Meta Cloud API",
    };
  }
  return {
    provider: "callmebot",
    configured: false,
    greenConfigured,
    metaConfigured,
    hint: "הגדר Green-API בהגדרות וואטסאפ (console.green-api.com → QR → הדבק מפתחות)",
  };
}
