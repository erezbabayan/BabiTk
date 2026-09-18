/** Google Calendar helpers shared with the Edge Function.
 * Keep in sync with supabase/functions/_shared/google-calendar.ts
 */

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const CALENDAR_TIMEZONE = "Asia/Jerusalem";
export const EVENT_DURATION_MS = 60 * 60 * 1000;
export const DEFAULT_WEB_APP_URL = "https://erezbabayan.github.io/BabiTk/";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export const CALENDAR_PATCH_KEYS = [
  "due_date",
  "is_actionable",
  "title",
  "content",
  "deleted_at",
] as const;

export type CalendarItemSnapshot = {
  title: string;
  content: string;
  is_actionable: boolean;
  due_date: string | null;
  deleted_at?: string | null;
  calendar_event_id?: string | null;
};

export function isCalendarRelevantPatch(patch: Record<string, unknown>): boolean {
  return CALENDAR_PATCH_KEYS.some((key) =>
    Object.prototype.hasOwnProperty.call(patch, key),
  );
}

export function shouldUpsertCalendarEvent(item: CalendarItemSnapshot): boolean {
  return (
    item.is_actionable === true &&
    typeof item.due_date === "string" &&
    item.due_date.length > 0 &&
    !item.deleted_at
  );
}

export function shouldDeleteCalendarEvent(item: CalendarItemSnapshot): boolean {
  return Boolean(item.calendar_event_id) && !shouldUpsertCalendarEvent(item);
}

export function calendarEventBody(
  item: Pick<CalendarItemSnapshot, "title" | "content" | "due_date">,
  timeZone = CALENDAR_TIMEZONE,
): {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
} {
  if (!item.due_date) {
    throw new Error("invalid_due_date");
  }
  const start = new Date(item.due_date);
  if (Number.isNaN(start.getTime())) {
    throw new Error("invalid_due_date");
  }
  const end = new Date(start.getTime() + EVENT_DURATION_MS);
  const content = item.content.trim();
  return {
    summary: item.title.trim() || "משימה",
    description: content ? `${content}\n\n— BabiTk` : "— BabiTk",
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
  };
}

export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CALENDAR_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  return url.toString();
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createOAuthState(
  userId: string,
  secret: string,
  now = Date.now(),
): Promise<string> {
  if (!userId.trim() || !secret) {
    throw new Error("invalid_oauth_state_input");
  }
  const exp = String(now + OAUTH_STATE_TTL_MS);
  const payload = `${userId}.${exp}`;
  const mac = await hmacSha256Hex(secret, payload);
  return `${payload}.${mac}`;
}

export async function parseOAuthState(
  state: string,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const parts = state.split(".");
  if (parts.length !== 3) {
    throw new Error("invalid_state");
  }
  const [userId, exp, mac] = parts;
  if (!userId || !exp || !mac) {
    throw new Error("invalid_state");
  }
  const expected = await hmacSha256Hex(secret, `${userId}.${exp}`);
  if (!timingSafeEqual(expected, mac)) {
    throw new Error("invalid_state");
  }
  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || expiresAt < now) {
    throw new Error("expired_state");
  }
  return userId;
}

export function calendarCallbackHtml(params: {
  ok: boolean;
  webAppUrl: string;
  message: string;
}): string {
  const title = params.ok ? "Google Calendar מחובר" : "חיבור היומן נכשל";
  const safeMessage = params.message
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const safeUrl = params.webAppUrl.replaceAll('"', "&quot;");
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: sans-serif; text-align: center; padding: 48px 16px; color: #0f172a; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <h2>${title}</h2>
  <p>${safeMessage}</p>
  <p><a href="${safeUrl}">חזרה ל-BabiTk</a></p>
  <script>
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: "babitk-calendar", ok: ${params.ok ? "true" : "false"} }, "*");
        window.close();
      } else {
        location.replace("${safeUrl}");
      }
    } catch (error) {
      location.replace("${safeUrl}");
    }
  </script>
</body>
</html>`;
}

export function withCalendarQuery(webAppUrl: string, status: "connected" | "error"): string {
  const url = new URL(webAppUrl);
  url.searchParams.set("calendar", status);
  return url.toString();
}
