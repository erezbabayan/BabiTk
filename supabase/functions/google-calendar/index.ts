import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  buildCalendarIcs,
  calendarEventRecurrence,
  buildGoogleAuthUrl,
  calendarCallbackHtml,
  calendarFeedSecret,
  calendarFeedToken,
  calendarFeedTokenValid,
  calendarIcsFeedUrl,
  googleCalendarSubscribeUrl,
  createOAuthState,
  disconnectGoogleCalendar,
  exchangeGoogleCode,
  googleCalendarConfig,
  googleCalendarStatus,
  GOOGLE_CALENDAR_PRIMARY_URL,
  googleOAuthSetupPublic,
  parseCalendarIcsRequest,
  isGoogleOAuthOwner,
  looksLikeGoogleClientId,
  looksLikeGoogleClientSecret,
  parseOAuthState,
  storeGoogleCalendarLink,
  storeGoogleRefreshToken,
  syncItemToGoogleCalendar,
  calendarOauthFailureMessage,
  withCalendarQuery,
  type CalendarDb,
} from "../_shared/google-calendar.ts";
import {
  enableStoredGoogleOAuth,
  fullAdminClient,
  hydrateGoogleConfig,
} from "../_shared/google-oauth-admin.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { ...CORS, "Content-Type": "text/html; charset=utf-8" },
  });
}

function adminClient(): CalendarDb {
  return fullAdminClient() as unknown as CalendarDb;
}

function readAccessToken(body: { accessToken?: unknown }): string | undefined {
  if (typeof body.accessToken !== "string") return undefined;
  const token = body.accessToken.trim();
  return token.length > 0 ? token : undefined;
}

async function probeGoogleAuthProvider(supabaseUrl: string): Promise<boolean> {
  const base = supabaseUrl.replace(/\/$/, "");
  if (!base) return false;
  try {
    const response = await fetch(`${base}/auth/v1/authorize?provider=google`, {
      redirect: "manual",
      signal: AbortSignal.timeout(4000),
    });
    return response.status >= 300 && response.status < 400;
  } catch {
    return false;
  }
}

function routeAction(req: Request): string {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const fromPath = path.split("/google-calendar")[1] ?? "";
  const cleaned = fromPath.replace(/^\//, "");
  if (cleaned) return cleaned.split("/")[0] ?? "";
  return (url.searchParams.get("action") ?? "").trim();
}

type AuthedUser = {
  id: string;
  email: string | null;
  username: string | null;
};

async function requireUser(req: Request): Promise<AuthedUser> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("not_authenticated");
  }
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error("missing_supabase_env");
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) {
    throw new Error("not_authenticated");
  }
  const admin = fullAdminClient();
  const { data: row } = await admin
    .from("users")
    .select("email, username")
    .eq("id", data.user.id)
    .maybeSingle();
  const metaUsername =
    typeof data.user.user_metadata?.username === "string"
      ? data.user.user_metadata.username
      : null;
  return {
    id: data.user.id,
    email:
      data.user.email ??
      (typeof row?.email === "string" ? row.email : null),
    username:
      (typeof row?.username === "string" ? row.username : null) ?? metaUsername,
  };
}

function readGoogleCredentials(body: {
  clientId?: unknown;
  clientSecret?: unknown;
}): { clientId: string; clientSecret: string } {
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
  if (!looksLikeGoogleClientId(clientId) || !looksLikeGoogleClientSecret(clientSecret)) {
    throw new Error("invalid_google_client");
  }
  return { clientId, clientSecret };
}

function eventDueFromRow(row: Record<string, unknown>): string | null {
  if (typeof row.due_date === "string" && row.due_date.length > 0) return row.due_date;
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const analysis = (metadata as Record<string, unknown>).analysis;
  if (!analysis || typeof analysis !== "object") return null;
  const record = analysis as Record<string, unknown>;
  if (typeof record.target_at === "string" && record.target_at) return record.target_at;
  if (typeof record.notify_at === "string" && record.notify_at) return record.notify_at;
  return null;
}

async function syncDatedTasksToGoogle(
  userId: string,
  accessToken?: string,
): Promise<number> {
  const admin = fullAdminClient();
  const { data, error } = await admin
    .from("mindtasker_items")
    .select("id")
    .eq("user_id", userId)
    .eq("is_actionable", true)
    .not("due_date", "is", null)
    .is("deleted_at", null)
    .limit(100);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((row) => String(row.id));
  const db = adminClient();
  for (const itemId of ids) {
    await syncItemToGoogleCalendar(db, userId, itemId, { accessToken });
  }
  return ids.length;
}

async function listDatedCalendarEvents(
  userId: string,
): Promise<
  Array<{
    id: string;
    title: string;
    content: string;
    due_date: string;
    recurrence: ReturnType<typeof calendarEventRecurrence>;
  }>
> {
  const admin = fullAdminClient();
  const { data, error } = await admin
    .from("mindtasker_items")
    .select("id, title, content, is_actionable, due_date, deleted_at, status, completed_at, metadata")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .neq("status", "completed")
    .limit(400);
  if (error) {
    console.error("google-calendar ics", error);
    throw new Error("calendar_failed");
  }
  return (data ?? [])
    .map((row) => {
      const due = eventDueFromRow(row as Record<string, unknown>);
      if (!due || row.completed_at != null) return null;
      return {
        id: String(row.id),
        title: typeof row.title === "string" ? row.title : "",
        content: typeof row.content === "string" ? row.content : "",
        due_date: due,
        recurrence: calendarEventRecurrence(row.metadata),
      };
    })
    .filter(
      (
        event,
      ): event is {
        id: string;
        title: string;
        content: string;
        due_date: string;
        recurrence: ReturnType<typeof calendarEventRecurrence>;
      } => event !== null,
    );
}

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const config = googleCalendarConfig();
  const webAppUrl = config.webAppUrl;
  const oauthError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (oauthError || !code || !state) {
    const description = url.searchParams.get("error_description");
    const testingDenied =
      (oauthError ?? "").includes("access_denied") &&
      `${oauthError ?? ""} ${description ?? ""}`.toLowerCase().includes("403");
    return html(
      calendarCallbackHtml({
        ok: false,
        webAppUrl: withCalendarQuery(webAppUrl, "error", {
          error: oauthError,
          description,
        }),
        message: calendarOauthFailureMessage(
          testingDenied
            ? `${oauthError ?? "access_denied"}:403 ${description ?? ""}`
            : (oauthError ?? "access_denied"),
        ),
      }),
      400,
    );
  }

  try {
    if (!config.configured) {
      throw new Error("google_not_configured");
    }
    const userId = await parseOAuthState(state, config.clientSecret);
    const tokens = await exchangeGoogleCode(code);
    const db = adminClient();
    await storeGoogleRefreshToken(db, userId, tokens.refreshToken);
    try {
      await syncDatedTasksToGoogle(userId, tokens.accessToken);
    } catch (error) {
      console.error("google-calendar sync-all after oauth", error);
    }
    return html(
      calendarCallbackHtml({
        ok: true,
        webAppUrl: withCalendarQuery(webAppUrl, "connected"),
        message: "אפשר לסגור את החלון. משימות עם תאריך נכתבות עכשיו ליומן Google הראשי.",
      }),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "oauth_failed";
    const message = calendarOauthFailureMessage(reason);
    console.error("google-calendar oauth callback", reason);
    return html(
      calendarCallbackHtml({
        ok: false,
        webAppUrl: withCalendarQuery(webAppUrl, "error", {
          error: reason,
          description: reason,
        }),
        message,
      }),
      400,
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  await hydrateGoogleConfig();
  const action = routeAction(req);

  if (req.method === "GET" && (action === "callback" || action === "oauth")) {
    return handleCallback(req);
  }

  if ((req.method === "GET" || req.method === "HEAD") && action === "ics") {
    const url = new URL(req.url);
    const { userId, token } = parseCalendarIcsRequest(url.pathname, url.searchParams);
    const secret = calendarFeedSecret();
    if (!secret || !(await calendarFeedTokenValid(userId, token, secret))) {
      return new Response("not_found", { status: 404, headers: CORS });
    }
    const headers = {
      ...CORS,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="babitk.ics"',
      "Cache-Control": "public, max-age=300",
    };
    if (req.method === "HEAD") {
      return new Response(null, { status: 200, headers });
    }
    try {
      const events = await listDatedCalendarEvents(userId);
      return new Response(buildCalendarIcs(events), {
        status: 200,
        headers,
      });
    } catch {
      return new Response("calendar_failed", { status: 500, headers: CORS });
    }
  }

  if (req.method === "GET" && (action === "" || action === "health")) {
    const config = googleCalendarConfig();
    const setup = googleOAuthSetupPublic(SUPABASE_URL);
    const authProviderEnabled = await probeGoogleAuthProvider(SUPABASE_URL);
    return json({
      ok: true,
      configured: config.configured,
      authProviderEnabled,
      googleClientId: config.configured ? config.clientId : null,
      redirectUri: config.redirectUri,
      authRedirectUri: setup.authRedirectUri,
      calendarRedirectUri: setup.calendarRedirectUri,
      javascriptOrigins: setup.javascriptOrigins,
      scope: setup.scope,
    });
  }

  try {
    const user = await requireUser(req);
    const userId = user.id;
    const config = googleCalendarConfig();
    const canConfigure = isGoogleOAuthOwner({
      email: user.email,
      username: user.username,
    });

    if (req.method === "POST" && action === "configure") {
      if (!canConfigure) {
        return json(
          {
            error: "not_owner",
            message: "רק בעל החשבון יכול להפעיל את חיבור Google Calendar מההגדרות.",
          },
          403,
        );
      }
      const body = (await req.json().catch(() => ({}))) as {
        clientId?: unknown;
        clientSecret?: unknown;
      };
      const credentials = readGoogleCredentials(body);
      const enabled = await enableStoredGoogleOAuth(
        credentials.clientId,
        credentials.clientSecret,
      );
      const authPatched = enabled.authPatched;
      const secretsSynced = enabled.secretsSynced;
      const authProviderEnabled = authPatched
        ? true
        : await probeGoogleAuthProvider(SUPABASE_URL);
      return json({
        ok: true,
        configured: true,
        authProviderEnabled,
        secretsSynced,
        canConfigure: true,
      });
    }

    if (req.method === "POST" && (action === "google-add" || action === "subscribe")) {
      const secret = calendarFeedSecret();
      if (!secret) {
        return json({ error: "google_not_configured" }, 503);
      }
      const token = await calendarFeedToken(userId, secret);
      const feedUrl = calendarIcsFeedUrl(SUPABASE_URL, userId, token);
      const events = await listDatedCalendarEvents(userId);
      return json({
        ok: true,
        url: googleCalendarSubscribeUrl(feedUrl),
        eventCount: events.length,
      });
    }

    if (req.method === "GET" && (action === "connect" || action === "start")) {
      if (!config.configured) {
        const setup = googleOAuthSetupPublic(SUPABASE_URL);
        return json(
          {
            error: "google_not_configured",
            message: canConfigure
              ? "חיבור Google Calendar עדיין לא הוגדר. צרו לקוח OAuth ב-Google Cloud, הדביקו Client ID ו-Secret בהגדרות, ואז לחצו הפעל וחבר."
              : "חיבור Google Calendar עדיין לא הוגדר בשרת. צרו לקוח OAuth ב-Google Cloud עם כתובות ההפניה שמופיעות בהגדרות.",
            redirectUri: config.redirectUri,
            authRedirectUri: setup.authRedirectUri,
            calendarRedirectUri: setup.calendarRedirectUri,
            javascriptOrigins: setup.javascriptOrigins,
            canConfigure,
          },
          503,
        );
      }
      const state = await createOAuthState(userId, config.clientSecret);
      const url = buildGoogleAuthUrl({
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        state,
        loginHint: user.email,
      });
      return json({ url, configured: true });
    }

    if (req.method === "GET" && action === "status") {
      const status = await googleCalendarStatus(adminClient(), userId);
      const eventCount = status.writable
        ? (await listDatedCalendarEvents(userId)).length
        : 0;
      return json({
        ...status,
        canConfigure,
        eventCount,
        googleUrl: status.writable ? GOOGLE_CALENDAR_PRIMARY_URL : undefined,
      });
    }

    if (req.method === "POST" && action === "disconnect") {
      await disconnectGoogleCalendar(adminClient(), userId);
      return json({ ok: true, linked: false });
    }

    if (req.method === "POST" && action === "link") {
      const body = (await req.json().catch(() => ({}))) as { refreshToken?: unknown };
      const refreshToken =
        typeof body.refreshToken === "string" && body.refreshToken.trim().length > 8
          ? body.refreshToken.trim()
          : "";
      if (!refreshToken) {
        return json(
          {
            error: "missing_refresh_token",
            message: "חסר אסימון רענון מ-Google. לחצו «חבר» כדי לחבר את היומן הראשי.",
          },
          400,
        );
      }
      await storeGoogleCalendarLink(adminClient(), userId, refreshToken);
      return json({ ok: true, linked: true, writable: true });
    }

    if (req.method === "POST" && (action === "sync" || action === "sync-all" || action === "")) {
      const body = (await req.json().catch(() => ({}))) as {
        itemId?: string;
        action?: string;
        syncAll?: boolean;
        accessToken?: unknown;
      };
      const accessToken = readAccessToken(body);
      const syncAll = action === "sync-all" || body.syncAll === true;
      if (syncAll) {
        const count = await syncDatedTasksToGoogle(userId, accessToken);
        return json({ ok: true, count });
      }
      const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
      if (!itemId) {
        return json({ error: "missing_item_id" }, 400);
      }
      const result = await syncItemToGoogleCalendar(adminClient(), userId, itemId, {
        accessToken,
      });
      return json({ ok: true, result });
    }

    return json({ error: "not_found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "calendar_failed";
    if (message === "not_authenticated") {
      return json({ error: "not_authenticated" }, 401);
    }
    if (message === "not_owner") {
      return json({ error: "not_owner", message: "רק בעל החשבון יכול להפעיל את חיבור Google Calendar מההגדרות." }, 403);
    }
    if (message === "invalid_google_client") {
      return json(
        {
          error: "invalid_google_client",
          message:
            "Client ID או Secret לא תקינים. הדביקו את הערכים מלקוח Web application ב-Google Cloud.",
        },
        400,
      );
    }
    console.error("google-calendar", error);
    return json({ error: message }, 400);
  }
});
