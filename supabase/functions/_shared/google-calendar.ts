/** Google Calendar OAuth + sync for the live Supabase Edge path.
 * Pure helpers stay in sync with backend/src/lib/google-calendar.ts
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

type QueryResult = Promise<{
  data: Record<string, unknown> | null;
  error: { message: string } | null;
}>;

type FilterBuilder = {
  eq: (column: string, value: string) => FilterBuilder;
  maybeSingle: () => QueryResult;
};

type TableBuilder = {
  select: (columns: string) => FilterBuilder;
  update: (values: Record<string, unknown>) => FilterBuilder;
};

export type CalendarDb = {
  from: (table: string) => TableBuilder;
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

export function googleCalendarConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  webAppUrl: string;
  configured: boolean;
} {
  const clientId = (Deno.env.get("GOOGLE_CLIENT_ID") ?? "").trim();
  const clientSecret = (Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "").trim();
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const redirectUri = (
    Deno.env.get("GOOGLE_CALENDAR_REDIRECT_URI") ??
    Deno.env.get("GOOGLE_REDIRECT_URI") ??
    `${supabaseUrl}/functions/v1/google-calendar/callback`
  ).trim();
  const webAppUrl = (Deno.env.get("WEB_APP_URL") ?? DEFAULT_WEB_APP_URL).trim() ||
    DEFAULT_WEB_APP_URL;
  return {
    clientId,
    clientSecret,
    redirectUri,
    webAppUrl,
    configured: Boolean(clientId && clientSecret && redirectUri),
  };
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

async function googleTokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok) {
    throw new Error(data.error_description || data.error || `google_token_${response.status}`);
  }
  return data;
}

export async function exchangeGoogleCode(code: string): Promise<{
  refreshToken: string;
  accessToken: string;
}> {
  const config = googleCalendarConfig();
  if (!config.configured) {
    throw new Error("google_not_configured");
  }
  const tokens = await googleTokenRequest(
    new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  );
  if (!tokens.refresh_token) {
    throw new Error("missing_refresh_token");
  }
  if (!tokens.access_token) {
    throw new Error("missing_access_token");
  }
  return { refreshToken: tokens.refresh_token, accessToken: tokens.access_token };
}

async function accessTokenFromRefresh(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const config = googleCalendarConfig();
  if (!config.configured) {
    throw new Error("google_not_configured");
  }
  const tokens = await googleTokenRequest(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }),
  );
  if (!tokens.access_token) {
    throw new Error("missing_access_token");
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || refreshToken,
  };
}

async function calendarApi(
  accessToken: string,
  method: "POST" | "PUT" | "DELETE",
  eventId?: string | null,
  body?: Record<string, unknown>,
): Promise<{ id?: string; status: number }> {
  const path = eventId
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`
    : "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (method === "DELETE") {
    if (response.ok || response.status === 404 || response.status === 410) {
      return { status: response.status };
    }
    throw new Error(`calendar_delete_${response.status}`);
  }
  const data = (await response.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message || `calendar_${method.toLowerCase()}_${response.status}`);
  }
  return { id: data.id, status: response.status };
}

function asItemSnapshot(row: Record<string, unknown>): CalendarItemSnapshot {
  return {
    title: typeof row.title === "string" ? row.title : "",
    content: typeof row.content === "string" ? row.content : "",
    is_actionable: row.is_actionable === true,
    due_date: typeof row.due_date === "string" ? row.due_date : null,
    deleted_at: typeof row.deleted_at === "string" ? row.deleted_at : null,
    calendar_event_id: typeof row.calendar_event_id === "string" ? row.calendar_event_id : null,
  };
}

async function disableCalendarConnection(supabase: CalendarDb, userId: string): Promise<void> {
  await supabase
    .from("users")
    .update({
      google_refresh_token: null,
      google_calendar_enabled: false,
    })
    .eq("id", userId)
    .maybeSingle();
}

export async function storeGoogleRefreshToken(
  supabase: CalendarDb,
  userId: string,
  refreshToken: string,
): Promise<void> {
  await storeGoogleCalendarLink(supabase, userId, refreshToken);
}

export async function storeGoogleCalendarLink(
  supabase: CalendarDb,
  userId: string,
  refreshToken?: string | null,
): Promise<void> {
  const values: Record<string, unknown> = {
    google_calendar_enabled: true,
  };
  if (typeof refreshToken === "string" && refreshToken.trim().length > 8) {
    values.google_refresh_token = refreshToken.trim();
  }
  const { error } = await supabase
    .from("users")
    .update(values)
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
}

export async function disconnectGoogleCalendar(
  supabase: CalendarDb,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({
      google_refresh_token: null,
      google_calendar_enabled: false,
    })
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
}

export async function googleCalendarStatus(
  supabase: CalendarDb,
  userId: string,
): Promise<{ linked: boolean; configured: boolean; oauthConfigured: boolean }> {
  const config = googleCalendarConfig();
  const { data } = await supabase
    .from("users")
    .select("google_calendar_enabled, google_refresh_token")
    .eq("id", userId)
    .maybeSingle();
  const enabled = data?.google_calendar_enabled === true;
  return {
    linked: enabled,
    configured: true,
    oauthConfigured: config.configured,
  };
}

export type CalendarSyncResult = "created" | "updated" | "deleted" | "skipped";

function sanitizeAccessToken(value: unknown): string {
  if (typeof value !== "string") return "";
  const token = value.trim();
  if (token.length < 16 || token.length > 8192) return "";
  return token;
}

async function resolveCalendarAccessToken(
  supabase: CalendarDb,
  userId: string,
  refreshToken: string,
  providedAccessToken?: string,
): Promise<string | null> {
  const fromClient = sanitizeAccessToken(providedAccessToken);
  if (fromClient) return fromClient;

  if (refreshToken.length < 8) return null;
  const config = googleCalendarConfig();
  if (!config.configured) return null;

  try {
    const tokens = await accessTokenFromRefresh(refreshToken);
    if (tokens.refreshToken !== refreshToken) {
      await storeGoogleRefreshToken(supabase, userId, tokens.refreshToken);
    }
    return tokens.accessToken;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("invalid_grant") || message.includes("invalid_token")) {
      await disableCalendarConnection(supabase, userId);
      return null;
    }
    throw error;
  }
}

async function applyCalendarEventChange(
  supabase: CalendarDb,
  itemId: string,
  item: CalendarItemSnapshot,
  accessToken: string,
): Promise<CalendarSyncResult> {
  if (shouldUpsertCalendarEvent(item)) {
    const body = calendarEventBody(item);
    if (item.calendar_event_id) {
      try {
        await calendarApi(accessToken, "PUT", item.calendar_event_id, body);
        return "updated";
      } catch {
        const created = await calendarApi(accessToken, "POST", null, body);
        if (created.id && created.id !== item.calendar_event_id) {
          await supabase
            .from("mindtasker_items")
            .update({ calendar_event_id: created.id })
            .eq("id", itemId)
            .maybeSingle();
        }
        return "created";
      }
    }
    const created = await calendarApi(accessToken, "POST", null, body);
    if (created.id) {
      await supabase
        .from("mindtasker_items")
        .update({ calendar_event_id: created.id })
        .eq("id", itemId)
        .maybeSingle();
    }
    return "created";
  }

  if (item.calendar_event_id) {
    await calendarApi(accessToken, "DELETE", item.calendar_event_id);
    await supabase
      .from("mindtasker_items")
      .update({ calendar_event_id: null })
      .eq("id", itemId)
      .maybeSingle();
    return "deleted";
  }
  return "skipped";
}

export async function syncItemToGoogleCalendar(
  supabase: CalendarDb,
  userId: string,
  itemId: string,
  options: { accessToken?: string } = {},
): Promise<CalendarSyncResult> {
  if (!userId.trim() || !itemId.trim()) {
    throw new Error("missing_sync_ids");
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("google_refresh_token, google_calendar_enabled")
    .eq("id", userId)
    .maybeSingle();
  if (userError) throw new Error(userError.message);
  if (user?.google_calendar_enabled !== true) {
    return "skipped";
  }
  const refreshToken =
    typeof user?.google_refresh_token === "string" ? user.google_refresh_token : "";

  const { data: row, error: itemError } = await supabase
    .from("mindtasker_items")
    .select("title, content, is_actionable, due_date, deleted_at, calendar_event_id, user_id")
    .eq("id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (itemError) throw new Error(itemError.message);
  if (!row) return "skipped";

  const accessToken = await resolveCalendarAccessToken(
    supabase,
    userId,
    refreshToken,
    options.accessToken,
  );
  if (!accessToken) return "skipped";

  return applyCalendarEventChange(supabase, itemId, asItemSnapshot(row), accessToken);
}

export function queueCalendarSync(
  supabase: CalendarDb,
  userId: string,
  itemId: string,
): void {
  void syncItemToGoogleCalendar(supabase, userId, itemId).catch((error) => {
    console.error("google calendar sync failed", error);
  });
}
