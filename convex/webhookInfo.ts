import { v } from "convex/values";

import { query } from "./_generated/server";
import { loadGreenApiCredentials } from "./whatsappConfig";
function isMetaConfigured(): boolean {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "";
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "";
  if (!token || !phoneId) return false;
  if (token.length < 20) return false;
  if (phoneId === "1234567890") return false;
  return true;
}

/** Webhook setup info for Green-API Console (shown in app settings). */
export const greenApiInfo = query({
  args: {},
  returns: v.object({
    provider: v.literal("green-api"),
    path: v.string(),
    fullUrl: v.union(v.string(), v.null()),
    auth: v.string(),
    events: v.array(v.string()),
    supportedMedia: v.array(v.string()),
    userMatching: v.string(),
    voicePipeline: v.string(),
    visionPipeline: v.string(),
    pipeline: v.string(),
    whatsappReplies: v.string(),
    mediaStorage: v.string(),
    embeddings: v.string(),
    requiredEnv: v.array(v.string()),
    sendConfigured: v.boolean(),
    outboundProvider: v.union(
      v.literal("green-api"),
      v.literal("meta"),
      v.literal("none"),
    ),
    setupHint: v.string(),
  }),
  handler: async (ctx) => {
    const siteUrl = process.env.CONVEX_SITE_URL;
    const greenConfigured = (await loadGreenApiCredentials(ctx)) !== null;
    const metaConfigured = isMetaConfigured();
    const outboundProvider = greenConfigured
      ? ("green-api" as const)
      : metaConfigured
        ? ("meta" as const)
        : ("none" as const);

    return {
      provider: "green-api" as const,
      path: "/webhook/green-api",
      fullUrl: siteUrl ? `${siteUrl.replace(/\/$/, "")}/webhook/green-api` : null,
      auth: "Authorization: Bearer GREEN_API_WEBHOOK_TOKEN (or ?token= / x-webhook-token)",
      events: [
        "incomingMessageReceived",
        "outgoingMessageReceived (owner posts in capture group only)",
      ],
      supportedMedia: ["text", "audio", "image"],
      userMatching:
        "owner phone in linked WhatsApp group → users.phone (phoneVerified). Other chats ignored.",
      voicePipeline: "audio → Whisper (he) → GPT-4o-mini parse → tasks / notebooks",
      visionPipeline:
        "image → GPT-4o Vision OCR → GPT-4o-mini proofread → GPT-4o-mini parse → notebooks",
      pipeline:
        "WhatsApp capture group only — text/voice/photo you post in your group → inbox tasks/notebooks",
      whatsappReplies:
        "digests: CallMeBot (צליל) אם יש APIKEY, אחרת Green-API; reminders/replies similarly",
      mediaStorage: "Convex file storage (sourceStorageId) + optional Green-API URL snapshot",
      embeddings: "notebooks.embedding via text-embedding-3-small (1536)",
      requiredEnv: [
        "OPENAI_API_KEY",
        "GREEN_API_INSTANCE_ID",
        "GREEN_API_TOKEN",
      ],
      sendConfigured: greenConfigured || metaConfigured,
      outboundProvider,
      setupHint: greenConfigured
        ? "שליחה מוכנה. לקליטה: שלח רק בקבוצת הקליטה שלך (טקסט/קול/תמונה). ההודעה הראשונה בקבוצה נרשמת אוטומטית."
        : metaConfigured
          ? "שליחת וואטסאפ מוכנה (Meta)"
          : "הגדר Green-API: console.green-api.com → QR → הדבק Instance ID + Token בהגדרות וואטסאפ",
    };
  },
});
