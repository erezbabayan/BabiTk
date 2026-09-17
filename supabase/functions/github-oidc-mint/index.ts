import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import * as jose from "npm:jose@5";

import {
  GITHUB_OIDC_AUDIENCE,
  GITHUB_OIDC_ISSUER,
  isAllowedGitHubOidcClaims,
} from "../_shared/github-oidc.ts";

const JWKS = jose.createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function bearerToken(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match?.[1] ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    return json({ ok: true, endpoint: "github-oidc-mint" });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const jwt = bearerToken(req);
  if (!jwt) {
    return json({ error: "missing_oidc_token" }, 401);
  }

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

  const accessToken = Deno.env.get("GITHUB_OIDC_DEPLOY_TOKEN") ?? "";
  if (!accessToken) {
    return json({ error: "management_token_missing" }, 500);
  }
  return json({ access_token: accessToken });
});
