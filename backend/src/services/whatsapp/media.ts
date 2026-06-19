import { env } from "../../config/env.js";
import type { WhatsAppInboundMessage } from "../../types/whatsapp.js";

interface WhatsAppMediaInfo {
  url: string;
  mime_type?: string;
}

async function downloadFromUrl(
  url: string,
  mimeTypeHint?: string,
  headers?: Record<string, string>,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType:
      mimeTypeHint ??
      response.headers.get("content-type") ??
      "application/octet-stream",
  };
}

async function downloadMetaMedia(mediaId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
}> {
  if (!env.whatsappAccessToken) {
    throw new Error("WhatsApp Meta API is not configured");
  }

  const metaResponse = await fetch(
    `https://graph.facebook.com/${env.whatsappGraphApiVersion}/${mediaId}`,
    {
      headers: { Authorization: `Bearer ${env.whatsappAccessToken}` },
    },
  );

  if (!metaResponse.ok) {
    throw new Error(`Failed to resolve WhatsApp media: ${metaResponse.status}`);
  }

  const meta = (await metaResponse.json()) as WhatsAppMediaInfo;
  if (!meta.url) {
    throw new Error("WhatsApp media URL missing");
  }

  return downloadFromUrl(meta.url, meta.mime_type, {
    Authorization: `Bearer ${env.whatsappAccessToken}`,
  });
}

export async function downloadWhatsAppMedia(mediaId: string): Promise<{
  buffer: Buffer;
  mimeType: string;
}> {
  return downloadMetaMedia(mediaId);
}

export async function downloadInboundMedia(
  message: WhatsAppInboundMessage,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (message.type === "audio") {
    if (message.audioUrl) {
      return downloadFromUrl(message.audioUrl, message.mimeType);
    }
    if (message.audioId) {
      return downloadMetaMedia(message.audioId);
    }
  }

  if (message.type === "image") {
    if (message.imageUrl) {
      return downloadFromUrl(message.imageUrl, message.mimeType);
    }
    if (message.imageId) {
      return downloadMetaMedia(message.imageId);
    }
  }

  throw new Error("Inbound message has no downloadable media reference");
}
