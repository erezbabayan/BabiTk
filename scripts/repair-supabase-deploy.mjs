#!/usr/bin/env node
/**
 * Repair a revoked/expired Supabase Management API token and deploy Edge Functions.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/repair-supabase-deploy.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_REF = "ghibfuinantybqidwadj";
const FUNCTIONS = [
  ["whatsapp-green-webhook", true],
  ["transcribe-voice-item", false],
  ["whatsapp-green-connect", false],
  ["whatsapp-send-reminders", true],
  ["ingest-voice", false],
  ["ingest-notebook", false],
  ["github-oidc-mint", true],
  ["google-calendar", true],
  ["google-login", true],
];

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

function looksLikePat(token) {
  return /^sbp_[A-Za-z0-9]{20,}$/.test(token.trim());
}

const fileEnv = {
  ...readEnvFile(join(root, ".google-oauth.local.env")),
  ...readEnvFile(join(root, ".supabase-local.env")),
};
const token = (
  process.env.SUPABASE_ACCESS_TOKEN ??
  fileEnv.SUPABASE_ACCESS_TOKEN ??
  ""
).trim();

if (!looksLikePat(token)) {
  console.error(
    "Missing valid SUPABASE_ACCESS_TOKEN (sbp_ from https://supabase.com/dashboard/account/tokens)",
  );
  process.exit(1);
}

const probe = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}`,
  { headers: { Authorization: `Bearer ${token}`, apikey: token } },
);
if (probe.status !== 200) {
  const detail = await probe.text();
  console.error(`Token probe HTTP ${probe.status}: ${detail.slice(0, 200)}`);
  process.exit(1);
}
console.log("Management API token is valid.");

function runSupabase(args) {
  const result = spawnSync("npx", ["supabase", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    throw new Error(`supabase ${args.join(" ")} failed`);
  }
  if (result.stdout.trim()) console.log(result.stdout.trim());
}

runSupabase([
  "secrets",
  "set",
  "--project-ref",
  PROJECT_REF,
  `GITHUB_OIDC_DEPLOY_TOKEN=${token}`,
  `BABITK_MANAGEMENT_TOKEN=${token}`,
]);
console.log("Synced GITHUB_OIDC_DEPLOY_TOKEN and BABITK_MANAGEMENT_TOKEN.");

for (const [slug, skipJwt] of FUNCTIONS) {
  const args = ["functions", "deploy", slug, "--project-ref", PROJECT_REF];
  if (skipJwt) args.push("--no-verify-jwt");
  console.log(`Deploying ${slug}...`);
  runSupabase(args);
}

const health = await fetch(
  `https://${PROJECT_REF}.supabase.co/functions/v1/whatsapp-green-webhook`,
);
const body = await health.json().catch(() => ({}));
console.log("Live webhook:", body);
if (body?.capture !== "group-lid-v1") {
  console.error("Webhook did not advertise capture group-lid-v1.");
  process.exit(1);
}
console.log("WhatsApp group capture is live.");
