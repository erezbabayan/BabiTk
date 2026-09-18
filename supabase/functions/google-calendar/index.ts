import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  buildGoogleAuthUrl,
  calendarCallbackHtml,
  createOAuthState,
  disconnectGoogleCalendar,
  exchangeGoogleCode,
  googleCalendarConfig,
  googleCalendarStatus,
  parseOAuthState,
  storeGoogleCalendarLink,
  storeGoogleRefreshToken,
  syncItemToGoogleCalendar,
  withCalendarQuery,
  type CalendarDb,
} from "../_shared/google-calendar.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

function fullAdminClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error("missing_supabase_env");
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
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

function routeAction(req: Request): string {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const fromPath = path.split("/google-calendar")[1] ?? "";
  const cleaned = fromPath.replace(/^\//, "");
  if (cleaned) return cleaned.split("/")[0] ?? "";
  return (url.searchParams.get("action") ?? "").trim();
}

async function requireUserId(req: Request): Promise<string> {
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
  return data.user.id;
}

async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const config = googleCalendarConfig();
  const webAppUrl = config.webAppUrl;
  const oauthError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (oauthError || !code || !state) {
    return html(
      calendarCallbackHtml({
        ok: false,
        webAppUrl: withCalendarQuery(webAppUrl, "error"),
        message: "החיבור ליומן בוטל או נכשל. אפשר לנסות שוב מההגדרות.",
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
    await storeGoogleRefreshToken(adminClient(), userId, tokens.refreshToken);
    return html(
      calendarCallbackHtml({
        ok: true,
        webAppUrl: withCalendarQuery(webAppUrl, "connected"),
        message: "אפשר לסגור את החלון. משימות עם תאריך יופיעו עכשיו ביומן Google.",
      }),
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "oauth_failed";
    const message =
      reason === "missing_refresh_token"
        ? "Google לא החזיר הרשאת רענון. בטלו את הגישה ל-BabiTk בחשבון Google ונסו שוב."
        : "לא הצלחנו לשמור את חיבור היומן. נסו שוב מההגדרות.";
    return html(
      calendarCallbackHtml({
        ok: false,
        webAppUrl: withCalendarQuery(webAppUrl, "error"),
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

  const action = routeAction(req);

  if (req.method === "GET" && (action === "callback" || action === "oauth")) {
    return handleCallback(req);
  }

  if (req.method === "GET" && (action === "" || action === "health")) {
    const config = googleCalendarConfig();
    return json({
      ok: true,
      configured: config.configured,
      redirectUri: config.redirectUri,
      scope: "https://www.googleapis.com/auth/calendar.events",
    });
  }

  try {
    const userId = await requireUserId(req);
    const config = googleCalendarConfig();

    if (req.method === "GET" && (action === "connect" || action === "start")) {
      if (!config.configured) {
        return json(
          {
            error: "google_not_configured",
            message: "חיבור Google Calendar עדיין לא הוגדר בשרת.",
            redirectUri: config.redirectUri,
          },
          503,
        );
      }
      const state = await createOAuthState(userId, config.clientSecret);
      const url = buildGoogleAuthUrl({
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        state,
      });
      return json({ url, configured: true });
    }

    if (req.method === "GET" && action === "status") {
      const status = await googleCalendarStatus(adminClient(), userId);
      return json(status);
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
          : null;
      await storeGoogleCalendarLink(adminClient(), userId, refreshToken);
      return json({ ok: true, linked: true });
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
        const admin = fullAdminClient();
        const { data, error } = await admin
          .from("mindtasker_items")
          .select("id")
          .eq("user_id", userId)
          .eq("is_actionable", true)
          .not("due_date", "is", null)
          .is("deleted_at", null)
          .limit(20);
        if (error) throw new Error(error.message);
        const ids = (data ?? []).map((row) => String(row.id));
        const results: string[] = [];
        for (const itemId of ids) {
          results.push(
            await syncItemToGoogleCalendar(adminClient(), userId, itemId, { accessToken }),
          );
        }
        return json({ ok: true, count: results.length, results });
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
    console.error("google-calendar", error);
    return json({ error: message }, 400);
  }
});
