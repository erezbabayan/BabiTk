import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";
import * as jose from "npm:jose@5";

import { repairDeploySecretsAndFunctions } from "../_shared/edge-function-deploy.ts";
import {
  GITHUB_OIDC_AUDIENCE,
  GITHUB_OIDC_ISSUER,
  isAllowedGitHubOidcClaims,
} from "../_shared/github-oidc.ts";
import {
  OWNER_REPAIR_VERSION,
  isDeployOwner,
  isSupabasePat,
  managementTokenError,
  probeManagementToken,
  readRepairAccessToken,
} from "../_shared/management-token.ts";

const JWKS = jose.createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);

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

function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match?.[1] ?? "";
}

function supabaseIssuer(url: string): string {
  return `${url.replace(/\/$/, "")}/auth/v1`;
}

async function storedDeployToken(): Promise<
  { ok: true; access_token: string } | { ok: false; error: string; status: number }
> {
  const accessToken = (Deno.env.get("GITHUB_OIDC_DEPLOY_TOKEN") ?? "").trim();
  if (!accessToken) {
    return { ok: false, error: "management_token_missing", status: 500 };
  }
  const probe = await probeManagementToken(accessToken);
  if (probe !== 200) {
    return {
      ok: false,
      error: managementTokenError(probe),
      status: 503,
    };
  }
  return { ok: true, access_token: accessToken };
}

async function mintForGithubOidc(jwt: string): Promise<Response> {
  let payload: Record<string, unknown>;
  try {
    const verified = await jose.jwtVerify(jwt, JWKS, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: GITHUB_OIDC_AUDIENCE,
    });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_oidc_token" }, 401);
  }
  if (!isAllowedGitHubOidcClaims(payload)) {
    return json({ error: "oidc_not_allowed" }, 403);
  }
  const stored = await storedDeployToken();
  if (!stored.ok) {
    return json({ error: stored.error }, stored.status);
  }
  return json({ access_token: stored.access_token });
}

async function ownerFromSupabaseJwt(jwt: string): Promise<{
  email: string | null;
  username: string | null;
} | null> {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceRole) return null;
  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return null;
  const username =
    typeof data.user.user_metadata?.username === "string"
      ? data.user.user_metadata.username
      : null;
  return { email: data.user.email ?? null, username };
}

async function repairFromOwner(jwt: string, req: Request): Promise<Response> {
  const owner = await ownerFromSupabaseJwt(jwt);
  if (!owner || !isDeployOwner(owner)) {
    return json({ error: "owner_required" }, 403);
  }
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const accessToken = readRepairAccessToken(body);
  if (!isSupabasePat(accessToken)) {
    return json({ error: "management_token_missing" }, 400);
  }
  const probe = await probeManagementToken(accessToken);
  if (probe !== 200) {
    return json({ error: managementTokenError(probe), http: probe }, 401);
  }
  const result = await repairDeploySecretsAndFunctions(accessToken);
  if (!result.secrets) {
    return json({ error: "secret_sync_failed", ...result }, 502);
  }
  return json({
    ok: true,
    repaired: true,
    repair: OWNER_REPAIR_VERSION,
    deployed: result.deployed,
    failed: result.failed,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method === "GET") {
    return json({
      ok: true,
      endpoint: "github-oidc-mint",
      repair: OWNER_REPAIR_VERSION,
    });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const jwt = bearerToken(req);
  if (!jwt) {
    return json({ error: "missing_oidc_token" }, 401);
  }

  let iss = "";
  try {
    iss = String(jose.decodeJwt(jwt).iss ?? "");
  } catch {
    return json({ error: "invalid_oidc_token" }, 401);
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  if (iss === GITHUB_OIDC_ISSUER) {
    return await mintForGithubOidc(jwt);
  }
  if (supabaseUrl && iss === supabaseIssuer(supabaseUrl)) {
    return await repairFromOwner(jwt, req);
  }
  return json({ error: "invalid_oidc_token" }, 401);
});
