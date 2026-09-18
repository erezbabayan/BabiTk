#!/usr/bin/env node
/**
 * Set Supabase Auth Site URL + redirect allow-list for GitHub Pages,
 * and enable the Google provider when GOOGLE_CLIENT_ID/SECRET are present.
 *
 * Does not print secret values.
 */
const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF?.trim() || "ghibfuinantybqidwadj";
const SITE_URL =
  process.env.SUPABASE_SITE_URL?.trim() ||
  "https://erezbabayan.github.io/BabiTk/";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN?.trim() || "";

const REQUIRED_REDIRECTS = [
  SITE_URL,
  "https://erezbabayan.github.io/BabiTk/",
  "https://erezbabayan.github.io/BabiTk/**",
  "http://localhost:5173",
  "http://localhost:5173/",
  "http://localhost:5173/**",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5173/",
  "http://127.0.0.1:5173/**",
  "mindtasker://**",
];

function splitList(value) {
  return String(value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeAllowList(existing) {
  const seen = new Set();
  const merged = [];
  for (const item of [...splitList(existing), ...REQUIRED_REDIRECTS]) {
    if (seen.has(item)) continue;
    seen.add(item);
    merged.push(item);
  }
  return merged.join(",");
}

function looksLikeGoogleClientId(value) {
  return (
    Boolean(value) &&
    value.includes(".apps.googleusercontent.com") &&
    !/your-client|placeholder|YOUR_ID/i.test(value)
  );
}

function looksLikeGoogleSecret(value) {
  return Boolean(value) && value.length >= 12 && !/placeholder|GOCSPX-\.\.\./i.test(value);
}

function redact(text) {
  return String(text ?? "")
    .replace(/sbp_[A-Za-z0-9]+/g, "sbp_[redacted]")
    .replace(/GOCSPX-[A-Za-z0-9_-]+/g, "GOCSPX-[redacted]")
    .replace(/[A-Za-z0-9_-]+\.apps\.googleusercontent\.com/g, "[google-client-id]");
}

async function api(method, body) {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      apikey: TOKEN,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!response.ok) {
    const detail = redact(text).slice(0, 800);
    throw new Error(`Auth config ${method} failed (${response.status}): ${detail}`);
  }
  return parsed;
}

function googleCredentialsFromEnv() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || "";
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
  if (!looksLikeGoogleClientId(clientId) || !looksLikeGoogleSecret(secret)) {
    return null;
  }
  return { clientId, secret };
}

async function main() {
  if (!TOKEN) {
    throw new Error("SUPABASE_ACCESS_TOKEN is empty");
  }

  const current = await api("GET");
  const google = googleCredentialsFromEnv();
  const existingAllow =
    current.uri_allow_list || current.additional_redirect_urls || "";
  const patch = {
    site_url: SITE_URL,
    uri_allow_list: mergeAllowList(existingAllow),
  };

  if (google) {
    patch.external_google_enabled = true;
    patch.external_google_client_id = google.clientId;
    patch.external_google_secret = google.secret;
    patch.external_google_skip_nonce_check = true;
  }

  await api("PATCH", patch);

  const authorizeUrl = `https://${PROJECT_REF}.supabase.co/auth/v1/authorize?provider=google`;
  const probe = await fetch(authorizeUrl, { redirect: "manual" });
  const probeBody = redact(await probe.text()).slice(0, 300);
  const enabled =
    probe.status === 302 ||
    probe.status === 303 ||
    probe.status === 307 ||
    probe.status === 308;
  const stillDisabled =
    /provider is not enabled|unsupported provider/i.test(probeBody);

  console.log(`site_url=${SITE_URL}`);
  console.log(`google_secrets=${google ? "present" : "missing"}`);
  console.log(`authorize_status=${probe.status}`);
  if (enabled) {
    console.log("google_provider=enabled");
    return;
  }
  if (google && stillDisabled) {
    throw new Error(
      `Google provider still disabled after PATCH. Probe: ${probe.status} ${probeBody}`,
    );
  }
  if (stillDisabled) {
    console.warn(
      "google_provider=disabled — add GitHub secrets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then re-run this job.",
    );
    return;
  }
  console.warn(`google_provider=unknown probe=${probe.status} ${probeBody}`);
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
