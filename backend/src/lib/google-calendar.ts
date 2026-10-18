/** Google Calendar helpers shared with the Edge Function.
 * Keep in sync with supabase/functions/_shared/google-calendar.ts
 */

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const CALENDAR_TIMEZONE = "Asia/Jerusalem";
export const EVENT_DURATION_MS = 60 * 60 * 1000;
export const DEFAULT_WEB_APP_URL = "https://erezbabayan.github.io/BabiTk/";
export const GOOGLE_CALENDAR_PRIMARY_URL = "https://calendar.google.com/calendar/r";
export const GOOGLE_CALENDAR_SUBSCRIBE_RENDER_URL =
  "https://www.google.com/calendar/render";
export const ICS_LINE_OCTET_LIMIT = 75;
export type CalendarReminderRecurrence = "daily" | "weekly" | "monthly" | "weekdays";
export const DEFAULT_SUPABASE_URL = "https://ghibfuinantybqidwadj.supabase.co";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const GOOGLE_OAUTH_JAVASCRIPT_ORIGINS = [
  "https://erezbabayan.github.io",
  "http://localhost:5173",
] as const;

export const GOOGLE_OAUTH_OWNER_EMAILS = ["erezbabayan@gmail.com"] as const;
export const GOOGLE_OAUTH_OWNER_USERNAMES = ["erezbabayan", "erezbababan"] as const;
export const GOOGLE_OAUTH_INTEGRATION_KEY = "google_oauth";

export function looksLikeGoogleClientId(value: string): boolean {
  return (
    value.includes(".apps.googleusercontent.com") &&
    !/your-client|placeholder|YOUR_ID/i.test(value)
  );
}

export function looksLikeGoogleClientSecret(value: string): boolean {
  return value.length >= 12 && !/placeholder|GOCSPX-\.\.\./i.test(value);
}

export function isGoogleOAuthOwner(input: {
  email?: string | null;
  username?: string | null;
}): boolean {
  const email = (input.email ?? "").trim().toLowerCase();
  if ((GOOGLE_OAUTH_OWNER_EMAILS as readonly string[]).includes(email)) {
    return true;
  }
  const username = (input.username ?? "").trim().toLowerCase();
  return (GOOGLE_OAUTH_OWNER_USERNAMES as readonly string[]).includes(username);
}

export function googleOAuthSetupPublic(supabaseUrl = DEFAULT_SUPABASE_URL): {
  javascriptOrigins: string[];
  authRedirectUri: string;
  calendarRedirectUri: string;
  scope: string;
} {
  const base = supabaseUrl.replace(/\/$/, "") || DEFAULT_SUPABASE_URL;
  return {
    javascriptOrigins: [...GOOGLE_OAUTH_JAVASCRIPT_ORIGINS],
    authRedirectUri: `${base}/auth/v1/callback`,
    calendarRedirectUri: `${base}/functions/v1/google-calendar/callback`,
    scope: CALENDAR_SCOPE,
  };
}

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
  recurrence?: CalendarReminderRecurrence | null;
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
  item: Pick<CalendarItemSnapshot, "title" | "content" | "due_date" | "recurrence">,
  timeZone = CALENDAR_TIMEZONE,
): {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  recurrence?: string[];
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
  const rrule = icsRruleLine(item.recurrence ?? null);
  return {
    summary: item.title.trim() || "משימה",
    description: content ? `${content}\n\n— BabiTk` : "— BabiTk",
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
    ...(rrule ? { recurrence: [rrule] } : {}),
  };
}

export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  loginHint?: string | null;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CALENDAR_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("hl", "he");
  url.searchParams.set("state", params.state);
  const hint = params.loginHint?.trim() ?? "";
  if (hint.includes("@")) {
    url.searchParams.set("login_hint", hint);
  }
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

export function calendarOauthFailureMessage(reason: string): string {
  const raw = reason.trim();
  const lower = raw.toLowerCase();
  if (raw === "missing_refresh_token") {
    return "Google לא החזיר הרשאת רענון. בטלו את הגישה ל-BabiTk בחשבון Google ונסו שוב.";
  }
  if (raw === "invalid_state" || raw === "expired_state") {
    return "פג תוקף חיבור היומן. לחצו «חבר» שוב מאותו חלון.";
  }
  if (raw === "calendar_user_not_found") {
    return "לא נמצא חשבון לשמירת חיבור היומן. היכנסו שוב ונסו «חבר».";
  }
  if (raw === "google_not_configured") {
    return "חיבור ליומן Google הראשי עדיין לא זמין.";
  }
  if (
    lower.includes("access_denied") &&
    (lower.includes("403") || lower.includes("testing") || raw.includes("בדיקה"))
  ) {
    return "Google חוסם כרגע כתיבה ליומן הראשי. יומן BabiTk במערכת ממשיך לעבוד.";
  }
  if (lower.includes("access_denied")) {
    return "החיבור ליומן בוטל או נכשל. אפשר לנסות שוב מההגדרות.";
  }
  if (/[\u0590-\u05FF]/.test(raw)) return raw;
  return "לא הצלחנו לשמור את חיבור היומן. נסו שוב מההגדרות.";
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
  const payload = JSON.stringify({
    type: "babitk-calendar",
    ok: params.ok,
    error: params.ok ? null : params.message,
  });
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
        window.opener.postMessage(${payload}, "*");
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

export function withCalendarQuery(
  webAppUrl: string,
  status: "connected" | "error",
  oauth?: { error?: string | null; description?: string | null },
): string {
  const url = new URL(webAppUrl);
  url.searchParams.set("calendar", status);
  const error = oauth?.error?.trim() ?? "";
  if (status === "error" && error) {
    url.searchParams.set("error", error);
    const description = oauth?.description?.trim() ?? "";
    if (description) url.searchParams.set("error_description", description);
  }
  return url.toString();
}

export function googleCalendarLinkState(input: {
  enabled: boolean;
  refreshToken?: string | null;
  oauthConfigured: boolean;
}): {
  linked: boolean;
  writable: boolean;
  configured: boolean;
  oauthConfigured: boolean;
} {
  const refreshToken = (input.refreshToken ?? "").trim();
  const writable = input.enabled === true && refreshToken.length > 8;
  return {
    linked: writable,
    writable,
    configured: input.oauthConfigured === true,
    oauthConfigured: input.oauthConfigured === true,
  };
}

export function icsEscape(text: string): string {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\n")
    .replaceAll("\n", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

function isUtf8ContinuationByte(bytes: Uint8Array, index: number): boolean {
  const value = bytes[index];
  return value !== undefined && (value & 0xc0) === 0x80;
}

const ICS_ENCODER = new TextEncoder();
const ICS_DECODER = new TextDecoder();

/** RFC 5545: fold at 75 octets with CRLF + space. Google drops feeds with long lines. */
export function icsFoldLine(line: string, limit = ICS_LINE_OCTET_LIMIT): string {
  const bytes = ICS_ENCODER.encode(line);
  if (bytes.length <= limit) return line;
  const chunks: string[] = [];
  let offset = 0;
  let first = true;
  while (offset < bytes.length) {
    const budget = first ? limit : Math.max(1, limit - 1);
    let end = Math.min(offset + budget, bytes.length);
    while (end > offset && end < bytes.length && isUtf8ContinuationByte(bytes, end)) {
      end -= 1;
    }
    if (end <= offset) {
      end = Math.min(offset + 1, bytes.length);
      while (end < bytes.length && isUtf8ContinuationByte(bytes, end)) end += 1;
    }
    const piece = ICS_DECODER.decode(bytes.slice(offset, end));
    chunks.push(first ? piece : ` ${piece}`);
    first = false;
    offset = end;
  }
  return chunks.join("\r\n");
}

function icsDescription(content: string): string {
  const trimmed = content.trim();
  const snippet = trimmed.length > 280 ? `${trimmed.slice(0, 280)}…` : trimmed;
  return icsEscape(snippet ? `${snippet}\n\n— BabiTk` : "— BabiTk");
}

export function icsUtcStamp(iso: string): string {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) {
    throw new Error("invalid_due_date");
  }
  return start.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function calendarEventRecurrence(
  metadata: unknown,
): CalendarReminderRecurrence | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).reminder_recurrence;
  if (
    value === "daily" ||
    value === "weekly" ||
    value === "monthly" ||
    value === "weekdays"
  ) {
    return value;
  }
  return null;
}

/** ICS recurrence so Google Calendar expands the same series as the in-app month grid. */
export function icsRruleLine(
  recurrence: CalendarReminderRecurrence | null | undefined,
): string | null {
  switch (recurrence) {
    case "daily":
      return "RRULE:FREQ=DAILY";
    case "weekly":
      return "RRULE:FREQ=WEEKLY";
    case "monthly":
      return "RRULE:FREQ=MONTHLY";
    case "weekdays":
      return "RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH";
    default:
      return null;
  }
}

export function buildCalendarIcs(
  events: Array<{
    id: string;
    title: string;
    content: string;
    due_date: string;
    recurrence?: CalendarReminderRecurrence | null;
  }>,
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BabiTk//Calendar//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:BabiTk",
    "X-WR-TIMEZONE:Asia/Jerusalem",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];
  for (const event of events) {
    const start = icsUtcStamp(event.due_date);
    const end = icsUtcStamp(
      new Date(new Date(event.due_date).getTime() + EVENT_DURATION_MS).toISOString(),
    );
    const summary = icsEscape(event.title.trim() || "משימה");
    const description = icsDescription(event.content);
    const rrule = icsRruleLine(event.recurrence);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${icsEscape(event.id)}@babitk`,
      `DTSTAMP:${start}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
    );
    if (rrule) lines.push(rrule);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map((line) => icsFoldLine(line)).join("\r\n")}\r\n`;
}

export async function calendarFeedToken(userId: string, secret: string): Promise<string> {
  const id = userId.trim();
  if (!id || !secret) {
    throw new Error("invalid_calendar_feed_input");
  }
  return hmacSha256Hex(secret, `calendar-feed.${id}`);
}

export async function calendarFeedTokenValid(
  userId: string,
  token: string,
  secret: string,
): Promise<boolean> {
  if (!userId.trim() || !token.trim() || !secret) return false;
  const expected = await calendarFeedToken(userId, secret);
  return timingSafeEqual(expected, token.trim().toLowerCase());
}

export function calendarIcsFeedUrl(
  supabaseUrl: string,
  userId: string,
  token: string,
): string {
  const base = supabaseUrl.replace(/\/$/, "") || DEFAULT_SUPABASE_URL;
  return `${base}/functions/v1/google-calendar/ics/${encodeURIComponent(userId)}/${encodeURIComponent(token)}.ics`;
}

export function webcalFeedUrl(httpsUrl: string): string {
  return httpsUrl.replace(/^https:\/\//i, "webcal://").replace(/^http:\/\//i, "webcal://");
}

export function parseCalendarIcsRequest(
  pathname: string,
  search: URLSearchParams,
): { userId: string; token: string } {
  const path = pathname.replace(/\/+$/, "");
  const after = path.split("/google-calendar/ics")[1] ?? "";
  const parts = after.replace(/^\//, "").split("/").filter(Boolean);
  const fromPathUser = parts[0] ? decodeURIComponent(parts[0]) : "";
  const fromPathToken = parts[1] ? decodeURIComponent(parts[1]) : "";
  return {
    userId: stripIcsSuffix(fromPathUser || search.get("u") || "").trim(),
    token: stripIcsSuffix(fromPathToken || search.get("s") || "").trim(),
  };
}

function stripIcsSuffix(value: string): string {
  return value.replace(/\.ics$/i, "");
}

export function googleCalendarSubscribeUrl(feedUrl: string): string {
  // /calendar/r?cid=https://... treats the URL as a Google calendar id and
  // shows "added" without importing events. cid must be webcal://, and the
  // classic render endpoint is what actually subscribes to the ICS feed.
  const url = new URL(GOOGLE_CALENDAR_SUBSCRIBE_RENDER_URL);
  url.searchParams.set("cid", webcalFeedUrl(feedUrl));
  return url.toString();
}
