import { supabase, isDemoMode, isSupabaseConfigured } from "./supabase";
import { addDemoItem, isDemoPremium, setDemoPremium } from "./demo-store";
import { api } from "../../../convex/_generated/api";
import { isConvexConfigured, requireConvex } from "./convex";
import { resolveConvexUserId } from "./convex-user-cache";
import { asDirectConvexUserId } from "./legacy-user-id";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  readLocalAudioAsBase64,
  uploadLocalAudioToConvexUrl,
  uploadLocalImageToConvexUrl,
} from "./voice-upload";

const API_BASE = process.env.EXPO_PUBLIC_API_URL?.trim() ?? "";

let paywallHandler: ((code: "audio_quota" | "ai_parse_quota") => void) | null = null;

export function registerPaywallHandler(
  handler: ((code: "audio_quota" | "ai_parse_quota") => void) | null,
): void {
  paywallHandler = handler;
}

export class PaywallError extends Error {
  readonly code: "audio_quota" | "ai_parse_quota";

  constructor(code: "audio_quota" | "ai_parse_quota", message?: string) {
    super(message ?? "הגעת למכסה החודשית. שדרג ל-Premium להמשך.");
    this.name = "PaywallError";
    this.code = code;
  }
}

export function isPaywallError(error: unknown): error is PaywallError {
  return error instanceof PaywallError;
}

/** User-facing message for capture / Convex action failures. */
export function formatCaptureError(error: unknown, fallback = "הפעולה נכשלה"): string {
  if (isPaywallError(error)) return error.message;
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const lower = raw.toLowerCase();

  // Prefer explicit Hebrew / step messages from our upload helpers.
  if (
    (raw.includes("העלאת ההקלטה") || raw.includes("העלאה נכשלה")) &&
    /[\u0590-\u05FF]/.test(raw) &&
    raw.length < 220
  ) {
    return raw;
  }

  if (
    lower.includes("arguments size is too large") ||
    lower.includes("5 mib") ||
    lower.includes("argument too large")
  ) {
    return "ההקלטה ארוכה מדי לשליחה. נסו הקלטה קצרה יותר (עד כדקה).";
  }
  if (lower.includes("openai_api_key") || lower.includes("not configured")) {
    return "תמלול קולי עדיין לא מוגדר בשרת. נסו שוב בעוד רגע או פנו לתמיכה.";
  }
  if (
    lower.includes("quota") ||
    lower.includes("מכס") ||
    lower.includes("insufficient_quota") ||
    lower.includes("קרדיט")
  ) {
    return raw.includes("OpenAI") || raw.includes("RunPod") || /[\u0590-\u05FF]/.test(raw)
      ? raw.length < 220
        ? raw
        : "נגמרה מכסת התמלול. בדקו חיוב OpenAI או הגדירו RunPod."
      : "הגעתם למכסת התמלול החודשית.";
  }
  if (lower.includes("לא זוהה דיבור") || lower.includes("empty transcription")) {
    return "לא זוהה דיבור ברור בהקלטה. נסו שוב.";
  }
  if (lower.includes("unauthorized") || lower.includes("not authenticated")) {
    return "יש להתחבר מחדש כדי להעלות הקלטה.";
  }
  if (
    lower.includes("connection error") ||
    lower.includes("שגיאת חיבור לשרת התמלול") ||
    lower.includes("openai whisper http")
  ) {
    return "שגיאת חיבור לשרת התמלול. נסו שוב בעוד רגע.";
  }
  if (
    lower.includes("network request failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("network error") ||
    lower.includes("econnrefused")
  ) {
    return "אין חיבור לשרת. בדקו Wi‑Fi ונסו שוב.";
  }
  // Strip Convex action wrapper noise: [CONVEX A(...)] ... Uncaught Error: ...
  const uncaught = raw.match(/Uncaught Error:\s*(.+?)(?:\n|$)/i);
  if (uncaught?.[1]) {
    return formatCaptureError(new Error(uncaught[1].trim()), fallback);
  }
  const heLine = raw
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /[\u0590-\u05FF]/.test(line));
  if (heLine) return heLine;
  if (raw && !raw.includes("[CONVEX") && raw.length < 160) return raw;
  return fallback;
}

async function getAccessToken(): Promise<string | null> {
  if (isDemoMode) {
    return "demo";
  }

  if (!isSupabaseConfigured) {
    return null;
  }

  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export interface UsageSummary {
  tier: "free" | "premium";
  isPremium: boolean;
  periodStart: string;
  audio: { used: number; allocated: number; remaining: number };
  aiParses: { used: number; allocated: number; remaining: number };
}

function demoUsageSummary(isPremium: boolean): UsageSummary {
  const now = new Date().toISOString();
  if (isPremium) {
    return {
      tier: "premium",
      isPremium: true,
      periodStart: now,
      audio: { used: 0, allocated: Number.MAX_SAFE_INTEGER, remaining: Number.MAX_SAFE_INTEGER },
      aiParses: { used: 0, allocated: Number.MAX_SAFE_INTEGER, remaining: Number.MAX_SAFE_INTEGER },
    };
  }
  return {
    tier: "free",
    isPremium: false,
    periodStart: now,
    audio: { used: 1800, allocated: 120, remaining: 0 },
    aiParses: { used: 50, allocated: 3, remaining: 0 },
  };
}

export async function getUsageSummary(): Promise<UsageSummary> {
  if (isDemoMode) {
    return demoUsageSummary(await isDemoPremium());
  }

  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");

  if (!API_BASE) {
    throw new Error("Usage summary requires Convex (no REST API configured)");
  }

  const res = await fetch(`${API_BASE}/api/usage/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `API error ${res.status}`);
  }

  return res.json() as Promise<UsageSummary>;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");
  if (!API_BASE) {
    throw new Error("פעולה זו דורשת שרת REST — במצב Convex היא אינה זמינה");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (res.status === 402) {
    const body = (await res.json().catch(() => ({}))) as {
      code?: "audio_quota" | "ai_parse_quota";
      message?: string;
    };
    if (body.code) {
      paywallHandler?.(body.code);
      throw new PaywallError(body.code, body.message);
    }
  }

  return res;
}

async function readBillingError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (body.error === "stripe_not_configured") {
    return body.message ?? "תשלומים אינם מוגדרים בשרת";
  }
  return body.message ?? fallback;
}

export async function createCheckoutSession(platform: "web" | "mobile" = "mobile"): Promise<string> {
  if (isDemoMode) {
    await setDemoPremium(true);
    return "mindtasker://home?billing=success";
  }

  const res = await apiFetch("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ platform }),
  });

  if (!res.ok) {
    throw new Error(await readBillingError(res, `Checkout failed: ${res.status}`));
  }

  const data = (await res.json()) as { url: string };
  return data.url;
}

export interface UserProfile {
  id: string;
  email: string;
  phone: string | null;
  phone_verified: boolean;
  phone_pending: string | null;
}

export async function getProfile(): Promise<UserProfile> {
  const res = await apiFetch("/api/profile");
  if (!res.ok) throw new Error(`Profile failed: ${res.status}`);
  const data = (await res.json()) as { profile: UserProfile };
  return data.profile;
}

export async function requestPhoneVerification(
  phone: string,
): Promise<{ message: string; devCode?: string }> {
  const res = await apiFetch("/api/profile/phone/request", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<{ message: string; devCode?: string }>;
}

export async function verifyPhoneCode(
  code: string,
): Promise<{ profile: UserProfile; message: string }> {
  const res = await apiFetch("/api/profile/phone/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Verify failed: ${res.status}`);
  }
  return res.json() as Promise<{ profile: UserProfile; message: string }>;
}

export interface WhatsAppProviderStatus {
  provider: "meta" | "green-api" | "whapi";
  configured: boolean;
  inboundWebhookPath: string;
  metaWebhookPath?: string;
  label: string;
  setupHint: string;
}

export async function getWhatsAppStatus(): Promise<WhatsAppProviderStatus> {
  if (isDemoMode) {
    return {
      provider: "meta",
      configured: false,
      inboundWebhookPath: "/api/whatsapp/webhook/inbound",
      metaWebhookPath: "/api/whatsapp/webhook",
      label: "Meta Cloud API",
      setupHint: "הגדר WHATSAPP_PROVIDER ומפתחות API בשרת",
    };
  }

  const res = await fetch(`${API_BASE}/api/whatsapp/status`);
  if (!res.ok) throw new Error(`WhatsApp status failed: ${res.status}`);
  return res.json() as Promise<WhatsAppProviderStatus>;
}

export async function searchItems(
  query: string,
  scope: "inbox" | "today" | "notes",
): Promise<
  { id: string; title: string; content: string; tags: string[]; similarity: number }[]
> {
  const res = await apiFetch("/api/items/search", {
    method: "POST",
    body: JSON.stringify({ query, scope }),
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const data = (await res.json()) as {
    results: { id: string; title: string; content: string; tags: string[]; similarity: number }[];
  };
  return data.results;
}

/** @deprecated Use searchItems */
export async function searchNotes(query: string): Promise<
  { id: string; title: string; content: string; tags: string[]; similarity: number }[]
> {
  return searchItems(query, "notes");
}

export interface UserTag {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export async function getUserTags(): Promise<UserTag[]> {
  const res = await apiFetch("/api/tags");
  if (!res.ok) throw new Error(`Tags failed: ${res.status}`);
  const data = (await res.json()) as { tags: UserTag[] };
  return data.tags;
}

export async function saveUserTags(
  tags: { name: string; color: string }[],
): Promise<UserTag[]> {
  const res = await apiFetch("/api/tags", {
    method: "PUT",
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Save tags failed: ${res.status}`);
  }
  const data = (await res.json()) as { tags: UserTag[] };
  return data.tags;
}

function clientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jerusalem";
  } catch {
    return "Asia/Jerusalem";
  }
}

function convexIngestEnabled(): boolean {
  if (isDemoMode) return false;
  if (process.env.EXPO_PUBLIC_USE_CONVEX === "false") return false;
  return isConvexConfigured;
}

export async function ingestText(text: string, legacyUserId?: string): Promise<void> {
  if (isDemoMode) {
    const { ingestTextSync } = await import("./sync-client");
    let timezone = "Asia/Jerusalem";
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone;
    } catch {
      // keep default
    }
    await ingestTextSync({ text, sourceType: "whatsapp_text", timezone });
    return;
  }

  if (convexIngestEnabled()) {
    if (!legacyUserId) {
      throw new Error("Not authenticated");
    }
    const convex = requireConvex();
    const convexUserId = await resolveConvexUserId(legacyUserId, () =>
      convex.mutation(api.users.getOrCreateByLegacyId, { legacyId: legacyUserId }),
    );
    await convex.action(api.captureActions.ingestQuickText, {
      userId: convexUserId,
      text,
      timezone: clientTimezone(),
      locale: "he-IL",
    });
    return;
  }

  const res = await apiFetch("/api/ingest/text", {
    method: "POST",
    body: JSON.stringify({
      text,
      timezone: clientTimezone(),
      locale: "he-IL",
    }),
  });
  if (!res.ok) throw new Error(`Ingest failed: ${res.status}`);
}

async function uploadMultipart(path: string, uri: string, mimeType: string, name: string) {
  if (isDemoMode) {
    const { ingestVoiceSync } = await import("./sync-client");
    if (path.endsWith("/voice-ingest")) {
      await ingestVoiceSync(uri, mimeType, name);
      return;
    }
    return;
  }

  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");

  const form = new FormData();
  form.append("file", { uri, name, type: mimeType } as unknown as Blob);

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (res.status === 402) {
    const body = (await res.json().catch(() => ({}))) as {
      code?: "audio_quota" | "ai_parse_quota";
      message?: string;
    };
    if (body.code) {
      paywallHandler?.(body.code);
      throw new PaywallError(body.code, body.message);
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Upload failed ${res.status}`);
  }
}

export async function uploadNotebookOcr(
  uri: string,
  mimeType: string,
  legacyUserId?: string,
): Promise<void> {
  if (isDemoMode) {
    await uploadMultipart("/api/ai/notebook-ocr", uri, mimeType, "notebook.jpg");
    return;
  }

  if (convexIngestEnabled()) {
    if (!legacyUserId) {
      throw new Error("Not authenticated");
    }
    const convex = requireConvex();
    const directId = asDirectConvexUserId(legacyUserId);
    const convexUserId =
      directId ??
      (await resolveConvexUserId(legacyUserId, () =>
        convex.mutation(api.users.getOrCreateByLegacyId, { legacyId: legacyUserId }),
      ));

    const uploadUrl = await convex.mutation(api.files.generateUploadUrl, {});
    const uploaded = await uploadLocalImageToConvexUrl(uri, uploadUrl, mimeType);
    await convex.action(api.captureActions.ingestNotebookImage, {
      userId: convexUserId as Id<"users">,
      storageId: uploaded.storageId as Id<"_storage">,
      mimeType: uploaded.mimeType,
      timezone: clientTimezone(),
      locale: "he-IL",
    });
    return;
  }

  await uploadMultipart("/api/ai/notebook-ocr", uri, mimeType, "notebook.jpg");
}

export async function uploadVoiceNote(
  uri: string,
  legacyUserId?: string,
  options?: { durationSeconds?: number },
): Promise<void> {
  if (isDemoMode) {
    const { ingestVoiceSync } = await import("./sync-client");
    await ingestVoiceSync(uri, "audio/m4a", "recording.m4a");
    return;
  }

  if (convexIngestEnabled()) {
    if (!legacyUserId) {
      throw new Error("Not authenticated");
    }
    const convex = requireConvex();
    const directId = asDirectConvexUserId(legacyUserId);
    const convexUserId =
      directId ??
      (await resolveConvexUserId(legacyUserId, () =>
        convex.mutation(api.users.getOrCreateByLegacyId, { legacyId: legacyUserId }),
      ));

    const timezone = clientTimezone();
    const durationSeconds = options?.durationSeconds;

    // Primary: native binary upload → storageId → Node transcription.
    // Node actions are capped at ~5 MiB args; base64 of real recordings exceeds that.
    try {
      const uploadUrl = await convex.mutation(api.files.generateUploadUrl, {});
      const uploaded = await uploadLocalAudioToConvexUrl(uri, uploadUrl);
      await convex.action(api.captureActions.ingestVoiceCapture, {
        userId: convexUserId as Id<"users">,
        storageId: uploaded.storageId as Id<"_storage">,
        mimeType: uploaded.mimeType,
        timezone,
        locale: "he-IL",
        durationSeconds,
      });
      return;
    } catch (primaryError) {
      const primaryMsg =
        primaryError instanceof Error ? primaryError.message.toLowerCase() : "";
      // Only fall back when the upload step itself failed — not ASR/quota/auth.
      const uploadStepFailed =
        primaryMsg.includes("העלאת ההקלטה לשרת") ||
        primaryMsg.includes("upload") ||
        primaryMsg.includes("network request failed") ||
        primaryMsg.includes("failed to fetch") ||
        primaryMsg.includes("תשובת העלאה");
      if (!uploadStepFailed) {
        throw primaryError;
      }

      // Tiny-clip fallback only (must stay under Node 5 MiB arg limit).
      const audio = await readLocalAudioAsBase64(uri);
      await convex.action(api.captureActions.ingestVoiceFromBase64, {
        userId: convexUserId as Id<"users">,
        audioBase64: audio.base64,
        mimeType: audio.mimeType,
        timezone,
        locale: "he-IL",
        durationSeconds,
      });
      return;
    }
  }

  await uploadMultipart("/api/ai/voice-ingest", uri, "audio/m4a", "recording.m4a");
}

export async function getGoogleCalendarConnectUrl(): Promise<string> {
  if (isDemoMode) return "#demo-calendar";
  const res = await apiFetch("/api/integrations/google/connect");
  if (!res.ok) throw new Error("Calendar connect failed");
  const data = (await res.json()) as { url: string };
  return data.url;
}

export async function getGoogleCalendarStatus(): Promise<boolean> {
  if (isDemoMode) return false;
  const res = await apiFetch("/api/integrations/google/status");
  if (!res.ok) return false;
  const data = (await res.json()) as { linked: boolean };
  return data.linked;
}

export async function createBillingPortal(): Promise<string> {
  if (isDemoMode) {
    await setDemoPremium(false);
    return "mindtasker://home?billing=cancel";
  }

  const res = await apiFetch("/api/billing/portal", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(await readBillingError(res, "ניהול מנוי נכשל"));
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}
