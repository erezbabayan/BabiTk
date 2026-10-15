import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import { ingestRecordedImage } from "../_shared/notebook-ingest.ts";
import {
  isLikelyImageBytes,
  mimeForImageContainer,
  sniffImageContainer,
} from "../_shared/image-bytes.ts";
import { MAX_NOTEBOOK_IMAGE_BYTES } from "../_shared/notebook-ocr.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function adminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error("missing_supabase_env");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function optionalString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function isBlobLike(value: FormDataEntryValue | null): value is Blob {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as Blob).arrayBuffer === "function",
  );
}

function decodeImageBase64(imageBase64: string): Uint8Array {
  const cleaned = imageBase64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function readNotebookIngestRequest(req: Request): Promise<{
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const mimeType =
      optionalString(form.get("mimeType")) ||
      (isBlobLike(file) && file.type) ||
      "image/jpeg";
    const fileName =
      optionalString(form.get("fileName")) ||
      (file instanceof File ? file.name : "") ||
      "notebook.jpg";
    if (!isBlobLike(file) && typeof file !== "string") {
      throw new Error("image_required");
    }
    const bytes = isBlobLike(file)
      ? new Uint8Array(await file.arrayBuffer())
      : decodeImageBase64(file);
    return { bytes, mimeType, fileName };
  }

  const body = (await req.json()) as {
    imageBase64?: unknown;
    mimeType?: unknown;
    fileName?: unknown;
  };
  const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  if (!imageBase64) {
    throw new Error("image_required");
  }
  return {
    bytes: decodeImageBase64(imageBase64),
    mimeType:
      typeof body.mimeType === "string" && body.mimeType.trim()
        ? body.mimeType.trim()
        : "image/jpeg",
    fileName:
      typeof body.fileName === "string" && body.fileName.trim()
        ? body.fileName.trim()
        : "notebook.jpg",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return json({ ok: true });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "not_authenticated" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON || SERVICE_ROLE, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: "not_authenticated" }, 401);
  }
  const userId = userData.user.id;

  let payload: Awaited<ReturnType<typeof readNotebookIngestRequest>>;
  try {
    payload = await readNotebookIngestRequest(req);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid_image";
    return json(
      { error: reason === "image_required" ? "image_required" : "invalid_image", reason },
      400,
    );
  }

  if (payload.bytes.byteLength > MAX_NOTEBOOK_IMAGE_BYTES) {
    return json({ error: "image_too_large", reason: "image_too_large" }, 413);
  }
  if (!isLikelyImageBytes(payload.bytes)) {
    return json({ error: "invalid_image", reason: "downloaded_not_image" }, 400);
  }
  const mimeType = mimeForImageContainer(
    sniffImageContainer(payload.bytes),
    payload.mimeType,
  );

  try {
    const result = await ingestRecordedImage(adminClient(), userId, {
      bytes: payload.bytes,
      mimeType,
      fileName: payload.fileName,
    });
    return json({
      ok: true,
      itemId: result.itemId,
      title: result.title,
      content: result.content,
      text: result.content,
      extractedText: result.content,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    return json(
      {
        error: reason === "vision_ocr_not_configured" ? "ocr_not_configured" : "ocr_failed",
        reason,
      },
      502,
    );
  }
});
