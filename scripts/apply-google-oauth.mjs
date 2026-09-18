#!/usr/bin/env node
/**
 * Apply Google OAuth credentials to the live Supabase project:
 * Auth Google provider + Edge secrets + manual identity linking.
 *
 * Reads GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET from env or .google-oauth.local.env
 * Needs SUPABASE_ACCESS_TOKEN (sbp_...).
 */
import { existsSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".google-oauth.local.env");
const PROJECT_REF = "ghibfuinantybqidwadj";
const AUTH_CALLBACK = `https://${PROJECT_REF}.supabase.co/auth/v1/callback`;
const CALENDAR_CALLBACK =
  `https://${PROJECT_REF}.supabase.co/functions/v1/google-calendar/callback`;

function readEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return values;
}

const fileEnv = readEnvFile(envPath);
const clientId = process.env.GOOGLE_CLIENT_ID ?? fileEnv.GOOGLE_CLIENT_ID ?? "";
const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? fileEnv.GOOGLE_CLIENT_SECRET ?? "";
const token = process.env.SUPABASE_ACCESS_TOKEN ?? fileEnv.SUPABASE_ACCESS_TOKEN ?? "";

if (!token) {
  console.error("Missing SUPABASE_ACCESS_TOKEN (sbp_ from https://supabase.com/dashboard/account/tokens)");
  process.exit(1);
}

async function patchAuth(body) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Auth config PATCH failed (${response.status}): ${text.slice(0, 400)}`);
  }
  return JSON.parse(text);
}

const linking = await patchAuth({ security_manual_linking_enabled: true });
console.log(
  "Manual identity linking:",
  linking.security_manual_linking_enabled === true ? "enabled" : linking.security_manual_linking_enabled,
);

if (!clientId || !clientSecret || clientId.includes("YOUR_ID") || clientId.includes("your-client-id")) {
  console.error(`
Google OAuth client is still missing.

1. Google Cloud Console → Credentials → OAuth client ID (Web application)
2. Authorized JavaScript origins:
   https://erezbabayan.github.io
   http://localhost:5173
3. Authorized redirect URIs:
   ${AUTH_CALLBACK}
   ${CALENDAR_CALLBACK}
4. Enable Google Calendar API
5. Save to .google-oauth.local.env:

GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

6. Re-run: node scripts/apply-google-oauth.mjs
`);
  process.exit(1);
}

const auth = await patchAuth({
  external_google_enabled: true,
  external_google_client_id: clientId,
  external_google_secret: clientSecret,
  security_manual_linking_enabled: true,
});
console.log("Google Auth provider:", auth.external_google_enabled === true ? "enabled" : auth.external_google_enabled);

const secrets = spawnSync(
  "npx",
  [
    "supabase",
    "secrets",
    "set",
    "--project-ref",
    PROJECT_REF,
    `GOOGLE_CLIENT_ID=${clientId}`,
    `GOOGLE_CLIENT_SECRET=${clientSecret}`,
  ],
  { cwd: root, encoding: "utf8", env: { ...process.env, SUPABASE_ACCESS_TOKEN: token } },
);
if (secrets.status !== 0) {
  console.error(secrets.stderr || secrets.stdout);
  throw new Error("Failed to set Edge GOOGLE_* secrets");
}
console.log("Edge secrets GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET synced.");
console.log("\nSettings → Google Calendar → חבר is ready after the next Edge deploy.\n");
