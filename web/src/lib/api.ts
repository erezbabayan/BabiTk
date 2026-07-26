import { requireSupabase, isDemoMode } from "./supabase";
import { isDemoPremium, searchDemoNotes, setDemoPremium } from "./demo-store";

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

let paywallHandler: ((code: "audio_quota" | "ai_parse_quota") => void) | null = null;

export function registerPaywallHandler(
  handler: ((code: "audio_quota" | "ai_parse_quota") => void) | null,
): void {
  paywallHandler = handler;
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await requireSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (isDemoMode) {
    throw new Error("API not available in demo mode");
  }

  const token = await getAccessToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
      code?: "audio_quota" | "ai_parse_quota";
      error?: string;
    };

    if (response.status === 402 && body.code) {
      paywallHandler?.(body.code);
      throw new PaywallError(body.code, body.message);
    }

    const message =
      typeof body.message === "string"
        ? body.message
        : body.error === "tags_save_failed" || body.error === "validation_error"
          ? "שמירת תגיות נכשלה — בדוק שהבקאנד פועל"
          : `API error ${response.status}`;

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export interface UsageSummary {
  tier: "free" | "premium";
  isPremium: boolean;
  periodStart: string;
  audio: { used: number; allocated: number; remaining: number };
  aiParses: { used: number; allocated: number; remaining: number };
}

export async function getUsageSummaryApi(): Promise<UsageSummary> {
  if (isDemoMode) {
    const now = new Date().toISOString();
    const isPremium = isDemoPremium();
    return {
      tier: isPremium ? "premium" : "free",
      isPremium,
      periodStart: now,
      audio: isPremium
        ? { used: 0, allocated: Number.MAX_SAFE_INTEGER, remaining: Number.MAX_SAFE_INTEGER }
        : { used: 1800, allocated: 120, remaining: 0 },
      aiParses: isPremium
        ? { used: 0, allocated: Number.MAX_SAFE_INTEGER, remaining: Number.MAX_SAFE_INTEGER }
        : { used: 50, allocated: 3, remaining: 0 },
    };
  }

  return apiFetch<UsageSummary>("/api/usage/summary");
}

export interface NoteSearchHit {
  id: string;
  title: string;
  content: string;
  tags: string[];
  similarity: number;
  is_actionable?: boolean;
  status?: string;
}

export type SearchScope = "inbox" | "today" | "notes";

export async function searchItemsApi(
  query: string,
  scope: SearchScope,
): Promise<NoteSearchHit[]> {
  if (isDemoMode) {
    const items = await searchDemoNotes(query);
    return items.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
      tags: item.tags,
      similarity: 1,
      is_actionable: item.is_actionable,
      status: item.status,
    }));
  }

  const data = await apiFetch<{ results: NoteSearchHit[] }>("/api/items/search", {
    method: "POST",
    body: JSON.stringify({ query, scope }),
  });
  return data.results;
}

/** @deprecated Use searchItemsApi */
export async function searchNotesApi(query: string): Promise<NoteSearchHit[]> {
  return searchItemsApi(query, "notes");
}

export interface UserTag {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export async function getUserTagsApi(): Promise<UserTag[]> {
  const data = await apiFetch<{ tags: UserTag[] }>("/api/tags");
  return data.tags;
}

export async function saveUserTagsApi(
  tags: { name: string; color: string }[],
): Promise<UserTag[]> {
  const data = await apiFetch<{ tags: UserTag[] }>("/api/tags", {
    method: "PUT",
    body: JSON.stringify({ tags }),
  });
  return data.tags;
}

export async function toggleItemTypeApi(
  itemId: string,
  dueDate?: string | null,
): Promise<void> {
  await apiFetch(`/api/items/${itemId}/toggle-type`, {
    method: "PATCH",
    body: JSON.stringify({ due_date: dueDate ?? null }),
  });
}

export async function approveItemApi(itemId: string): Promise<void> {
  await apiFetch(`/api/items/${itemId}/approve`, { method: "PATCH" });
}

export async function getGoogleCalendarConnectUrl(): Promise<string> {
  if (isDemoMode) {
    return "#demo-calendar";
  }

  const data = await apiFetch<{ url: string }>("/api/integrations/google/connect");
  return data.url;
}

export async function getGoogleCalendarStatus(): Promise<boolean> {
  if (isDemoMode) {
    return false;
  }

  const data = await apiFetch<{ linked: boolean }>("/api/integrations/google/status");
  return data.linked;
}

export async function createCheckoutSessionApi(platform: "web" | "mobile" = "web"): Promise<string> {
  if (isDemoMode) {
    setDemoPremium(true);
    const base = platform === "mobile" ? "mindtasker://" : window.location.pathname;
    return `${base}?billing=success`;
  }

  const data = await apiFetch<{ url: string }>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify({ platform }),
  });
  return data.url;
}

export async function createBillingPortalApi(): Promise<string> {
  if (isDemoMode) {
    setDemoPremium(false);
    return `${window.location.pathname}?billing=canceled`;
  }

  const data = await apiFetch<{ url: string }>("/api/billing/portal", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data.url;
}

export interface UserProfile {
  id: string;
  email: string;
  phone: string | null;
  phone_verified: boolean;
  phone_pending: string | null;
}

export async function getProfileApi(): Promise<UserProfile> {
  const data = await apiFetch<{ profile: UserProfile }>("/api/profile");
  return data.profile;
}

export async function requestPhoneVerificationApi(
  phone: string,
): Promise<{ message: string; devCode?: string }> {
  return apiFetch("/api/profile/phone/request", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export async function verifyPhoneCodeApi(
  code: string,
): Promise<{ profile: UserProfile; message: string }> {
  return apiFetch("/api/profile/phone/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export interface WhatsAppProviderStatus {
  provider: "meta" | "green-api" | "whapi";
  configured: boolean;
  inboundWebhookPath: string;
  metaWebhookPath?: string;
  label: string;
  setupHint: string;
}

export async function getWhatsAppStatusApi(): Promise<WhatsAppProviderStatus> {
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

  const response = await fetch("/api/whatsapp/status");
  if (!response.ok) {
    throw new Error(`WhatsApp status failed: ${response.status}`);
  }
  return response.json() as Promise<WhatsAppProviderStatus>;
}

export async function completeItemApi(itemId: string): Promise<void> {
  await apiFetch(`/api/items/${itemId}/complete`, { method: "PATCH" });
}

export async function snoozeItemApi(itemId: string, dueDate: string): Promise<void> {
  await apiFetch(`/api/items/${itemId}/snooze`, {
    method: "PATCH",
    body: JSON.stringify({ due_date: dueDate }),
  });
}

export async function restoreArchiveItemApi(itemId: string): Promise<void> {
  await apiFetch(`/api/items/${itemId}/restore-archive`, { method: "PATCH" });
}

export function clientTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jerusalem";
  } catch {
    return "Asia/Jerusalem";
  }
}

export async function ingestTextApi(text: string): Promise<{ items: { id: string }[] }> {
  return apiFetch("/api/ingest/text", {
    method: "POST",
    body: JSON.stringify({
      text,
      timezone: clientTimezone(),
      locale: "he-IL",
    }),
  });
}

export async function uploadNotebookOcrApi(file: File): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");

  const form = new FormData();
  form.append("file", file);

  const response = await fetch("/api/ai/notebook-ocr", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Upload failed ${response.status}`);
  }
}
