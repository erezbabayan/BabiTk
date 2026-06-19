import { query } from "./_generated/server";

/** Webhook setup info for Green-API Console (shown in app settings). */
export const greenApiInfo = query({
  args: {},
  handler: async (_ctx) => {
    const siteUrl = process.env.CONVEX_SITE_URL;
    return {
      provider: "green-api" as const,
      path: "/webhook/green-api",
      fullUrl: siteUrl ? `${siteUrl.replace(/\/$/, "")}/webhook/green-api` : null,
      auth: "Authorization: Bearer GREEN_API_WEBHOOK_TOKEN (or ?token= / x-webhook-token)",
      events: ["incomingMessageReceived"],
      supportedMedia: ["text", "audio", "image"] as const,
      userMatching: "senderData.chatId → sender_id → users.phone (phoneVerified=true)",
      voicePipeline: "audio → Whisper (he) → GPT-4o-mini parse → tasks / notebooks",
      visionPipeline:
        "image → GPT-4o Vision OCR → GPT-4o-mini proofread → GPT-4o-mini parse → notebooks",
      pipeline:
        "text | audio (Whisper→mini) | image (GPT-4o OCR→mini proofread→mini parse) → tasks / notebooks",
      whatsappReplies:
        "not_linked / quota / rejection / ingest confirmation via GREEN_API_* send",
      mediaStorage: "Convex file storage (sourceStorageId) + optional Green-API URL snapshot",
      embeddings: "notebooks.embedding via text-embedding-3-small (1536)",
      requiredEnv: [
        "OPENAI_API_KEY",
        "GREEN_API_WEBHOOK_TOKEN",
        "GREEN_API_INSTANCE_ID",
        "GREEN_API_TOKEN",
      ],
    };
  },
});
