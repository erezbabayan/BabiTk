import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import {
  GOOGLE_OAUTH_INTEGRATION_KEY,
  looksLikeGoogleClientId,
  looksLikeGoogleClientSecret,
  setGoogleOAuthOverride,
} from "./google-calendar.ts";

export function projectRefFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

export function managementToken(): string {
  return (
    Deno.env.get("BABITK_MANAGEMENT_TOKEN") ??
    Deno.env.get("GITHUB_OIDC_DEPLOY_TOKEN") ??
    ""
  ).trim();
}

export function supabaseEnv(): { url: string; anon: string; serviceRole: string } {
  return {
    url: (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, ""),
    anon: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    serviceRole: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  };
}

export function fullAdminClient(): SupabaseClient {
  const env = supabaseEnv();
  if (!env.url || !env.serviceRole) {
    throw new Error("missing_supabase_env");
  }
  return createClient(env.url, env.serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function hydrateGoogleConfig(): Promise<void> {
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

export async function persistGoogleOAuthRow(
  clientId: string,
  clientSecret: string,
): Promise<void> {
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

export async function patchAuthGoogleProvider(
  clientId: string,
  clientSecret: string,
): Promise<boolean> {
  const token = managementToken();
  const env = supabaseEnv();
  const ref = projectRefFromUrl(env.url);
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

export async function syncGoogleEdgeSecrets(
  clientId: string,
  clientSecret: string,
): Promise<boolean> {
  const token = managementToken();
  const env = supabaseEnv();
  const ref = projectRefFromUrl(env.url);
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

export async function enableStoredGoogleOAuth(
  clientId: string,
  clientSecret: string,
): Promise<{ authPatched: boolean; secretsSynced: boolean }> {
  await persistGoogleOAuthRow(clientId, clientSecret);
  setGoogleOAuthOverride(clientId, clientSecret);
  const [authPatched, secretsSynced] = await Promise.all([
    patchAuthGoogleProvider(clientId, clientSecret),
    syncGoogleEdgeSecrets(clientId, clientSecret),
  ]);
  return { authPatched, secretsSynced };
}
