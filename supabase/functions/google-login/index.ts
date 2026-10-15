import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import {
  googleCalendarConfig,
  isGoogleOAuthOwner,
  looksLikeGoogleClientId,
  looksLikeGoogleClientSecret,
} from "../_shared/google-calendar.ts";
import {
  googleAuthorizationCodeFromBody,
  googleIdentityFromTokenInfo,
  googleIdTokenFromBody,
  sessionTokensFromUnknown,
  type AuthSessionTokens,
  type GoogleIdentity,
} from "../_shared/google-login.ts";
import {
  enableStoredGoogleOAuth,
  fullAdminClient,
  hydrateGoogleConfig,
  supabaseEnv,
} from "../_shared/google-oauth-admin.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GIS_REDIRECT_URI = "postmessage";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function routeAction(req: Request): string {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const fromPath = path.split("/google-login")[1] ?? "";
  const cleaned = fromPath.replace(/^\//, "");
  if (cleaned) return cleaned.split("/")[0] ?? "";
  return (url.searchParams.get("action") ?? "").trim();
}

async function googleIdentityFromIdToken(
  idToken: string,
  clientId: string,
): Promise<GoogleIdentity> {
  const url = new URL(GOOGLE_TOKENINFO_URL);
  url.searchParams.set("id_token", idToken);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error("invalid_google_token");
  }
  return googleIdentityFromTokenInfo(data, clientId);
}

async function googleIdentityFromAuthorizationCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<GoogleIdentity> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    redirect_uri: GIS_REDIRECT_URI,
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8000),
  });
  const data = (await response.json().catch(() => null)) as
    | { id_token?: unknown }
    | null;
  const idToken = typeof data?.id_token === "string" ? data.id_token : "";
  if (!response.ok || !idToken) {
    throw new Error("invalid_google_code");
  }
  return googleIdentityFromIdToken(idToken, clientId);
}

async function issueSessionForIdentity(
  identity: GoogleIdentity,
): Promise<AuthSessionTokens> {
  const admin = fullAdminClient();
  const metadata = {
    full_name: identity.name ?? "",
    name: identity.name ?? "",
    avatar_url: identity.picture ?? "",
    picture: identity.picture ?? "",
    email: identity.email,
    provider: "google",
    sub: identity.sub,
  };

  const created = await admin.auth.admin.createUser({
    email: identity.email,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (created.error && !/already|registered|exists/i.test(created.error.message)) {
    throw new Error(created.error.message || "user_create_failed");
  }

  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: identity.email,
  });
  const hashedToken = link.data.properties?.hashed_token ?? "";
  if (link.error || !hashedToken) {
    throw new Error(link.error?.message || "session_issue_failed");
  }

  const verified = await admin.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashedToken,
  });
  if (verified.error || !verified.data.session) {
    throw new Error(verified.error?.message || "session_issue_failed");
  }
  return sessionTokensFromUnknown(verified.data.session);
}

async function signInOwner(
  email: string,
  password: string,
): Promise<{ email: string; session: AuthSessionTokens }> {
  const env = supabaseEnv();
  if (!env.url || !env.anon) {
    throw new Error("missing_supabase_env");
  }
  const client = createClient(env.url, env.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user?.email || !data.session) {
    throw new Error("invalid_login");
  }
  if (!isGoogleOAuthOwner({ email: data.user.email })) {
    throw new Error("not_owner");
  }
  return {
    email: data.user.email,
    session: sessionTokensFromUnknown(data.session),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  await hydrateGoogleConfig();
  const action = routeAction(req);
  const config = googleCalendarConfig();

  if (req.method === "GET") {
    const env = supabaseEnv();
    let authProviderEnabled = false;
    try {
      const response = await fetch(
        `${env.url.replace(/\/$/, "")}/auth/v1/authorize?provider=google`,
        { redirect: "manual", signal: AbortSignal.timeout(4000) },
      );
      authProviderEnabled = response.status >= 300 && response.status < 400;
    } catch {
      authProviderEnabled = false;
    }
    return json({
      ok: true,
      configured: config.configured,
      authProviderEnabled,
      googleClientId: config.configured ? config.clientId : null,
    });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    if (action === "activate") {
      const body = (await req.json().catch(() => ({}))) as {
        email?: unknown;
        password?: unknown;
        clientId?: unknown;
        clientSecret?: unknown;
      };
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
      const clientSecret =
        typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
      if (!email || !password) {
        throw new Error("invalid_login");
      }
      if (!looksLikeGoogleClientId(clientId) || !looksLikeGoogleClientSecret(clientSecret)) {
        throw new Error("invalid_google_client");
      }
      const owner = await signInOwner(email, password);
      const enabled = await enableStoredGoogleOAuth(clientId, clientSecret);
      return json({
        ok: true,
        configured: true,
        authProviderEnabled: enabled.authPatched,
        secretsSynced: enabled.secretsSynced,
        googleClientId: clientId,
        ...owner.session,
      });
    }

    if (!config.configured) {
      return json(
        {
          error: "google_not_configured",
          message:
            "כניסת Google עדיין לא הופעלה. היכנסו עם סיסמה, או הדביקו Client ID ו-Secret בהפעלה החד-פעמית.",
        },
        503,
      );
    }

    const body: unknown = await req.json().catch(() => ({}));
    let identity: GoogleIdentity;
    try {
      const code = googleAuthorizationCodeFromBody(body);
      identity = await googleIdentityFromAuthorizationCode(
        code,
        config.clientId,
        config.clientSecret,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "missing_google_code") {
        const idToken = googleIdTokenFromBody(body);
        identity = await googleIdentityFromIdToken(idToken, config.clientId);
      } else {
        throw error;
      }
    }

    const session = await issueSessionForIdentity(identity);
    return json({
      ok: true,
      email: identity.email,
      ...session,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "google_login_failed";
    if (message === "invalid_login") {
      return json({ error: message, message: "אימייל או סיסמה שגויים." }, 401);
    }
    if (message === "not_owner") {
      return json(
        {
          error: message,
          message: "רק בעל החשבון יכול להפעיל כניסת Google מהמסך הזה.",
        },
        403,
      );
    }
    if (message === "invalid_google_client") {
      return json(
        {
          error: message,
          message:
            "Client ID או Secret לא תקינים. הדביקו את הערכים מלקוח Web application ב-Google Cloud.",
        },
        400,
      );
    }
    if (
      message === "invalid_google_token" ||
      message === "invalid_google_code" ||
      message === "invalid_google_audience" ||
      message === "invalid_google_issuer" ||
      message === "unverified_google_email" ||
      message === "invalid_google_email" ||
      message === "missing_google_id_token" ||
      message === "missing_google_code"
    ) {
      return json(
        { error: message, message: "התחברות Google נכשלה. נסו שוב." },
        401,
      );
    }
    console.error("google-login", error);
    return json({ error: message, message: "התחברות Google נכשלה. נסו שוב." }, 400);
  }
});
