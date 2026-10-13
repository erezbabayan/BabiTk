import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  GOOGLE_OAUTH_INTEGRATION_KEY,
  buildGoogleAuthUrl,
  calendarCallbackHtml,
  createOAuthState,
  disconnectGoogleCalendar,
  exchangeGoogleCode,
  googleCalendarConfig,
  googleCalendarStatus,
  googleOAuthSetupPublic,
  isGoogleOAuthOwner,
  looksLikeGoogleClientId,
  looksLikeGoogleClientSecret,
  parseOAuthState,
  setGoogleOAuthOverride,
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

function projectRefFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

function managementToken(): string {
  return (Deno.env.get("BABITK_MANAGEMENT_TOKEN") ?? "").trim();
}

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

async function hydrateGoogleConfig(): Promise<void> {
  try {
    const admin = fullAdminClient();
    const { data, error } = await admin
      .from("app_integrations")
      .select("google_client_id, google_client_secret")
      .eq("key", GOOGLE_OAUTH_INTEGRATION_KEY)
      .maybeSingle();
    if (error || !data) return;
    const clientId =
      typeof data.google_client_id === "string" ? data.google_client_id.trim() : "";
    const clientSecret =
      typeof data.google_client_secret === "string"
        ? data.google_client_secret.trim()
        : "";
    if (looksLikeGoogleClientId(clientId) && looksLikeGoogleClientSecret(clientSecret)) {
      setGoogleOAuthOverride(clientId, clientSecret);
    }
  } catch (error) {
    console.error("hydrate google oauth", error);
  }
}

async function persistGoogleOAuthRow(clientId: string, clientSecret: string): Promise<void> {
  const admin = fullAdminClient();
  const { error } = await admin.from("app_integrations").upsert({
    key: GOOGLE_OAUTH_INTEGRATION_KEY,
    google_client_id: clientId,
    google_client_secret: clientSecret,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    throw new Error(error.message || "oauth_store_failed");
  }
}

async function patchAuthGoogleProvider(
  clientId: string,
  clientSecret: string,
): Promise<boolean> {
  const token = managementToken();
  const ref = projectRefFromUrl(SUPABASE_URL);
  if (!token || !ref) return false;
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_google_enabled: true,
      external_google_client_id: clientId,
      external_google_secret: clientSecret,
      external_google_skip_nonce_check: true,
      security_manual_linking_enabled: true,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("auth google patch failed", response.status, detail.slice(0, 200));
    return false;
  }
  return true;
}

async function syncGoogleEdgeSecrets(
  clientId: string,
  clientSecret: string,
): Promise<boolean> {
  const token = managementToken();
  const ref = projectRefFromUrl(SUPABASE_URL);
  if (!token || !ref) return false;
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/secrets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      { name: "GOOGLE_CLIENT_ID", value: clientId },
      { name: "GOOGLE_CLIENT_SECRET", value: clientSecret },
    ]),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("google secrets sync failed", response.status, detail.slice(0, 200));
    return false;
  }
  return true;
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

  await hydrateGoogleConfig();
  const action = routeAction(req);

  if (req.method === "GET" && (action === "callback" || action === "oauth")) {
    return handleCallback(req);
  }

  if (req.method === "GET" && (action === "" || action === "health")) {
    const config = googleCalendarConfig();
    const setup = googleOAuthSetupPublic(SUPABASE_URL);
    const authProviderEnabled = await probeGoogleAuthProvider(SUPABASE_URL);
    return json({
      ok: true,
      configured: config.configured,
      authProviderEnabled,
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
      await persistGoogleOAuthRow(credentials.clientId, credentials.clientSecret);
      setGoogleOAuthOverride(credentials.clientId, credentials.clientSecret);
      const [authPatched, secretsSynced] = await Promise.all([
        patchAuthGoogleProvider(credentials.clientId, credentials.clientSecret),
        syncGoogleEdgeSecrets(credentials.clientId, credentials.clientSecret),
      ]);
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
      });
      return json({ url, configured: true });
    }

    if (req.method === "GET" && action === "status") {
      const status = await googleCalendarStatus(adminClient(), userId);
      return json({ ...status, canConfigure });
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
