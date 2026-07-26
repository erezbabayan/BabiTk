#!/usr/bin/env node
/**
 * Configure Google OAuth for Convex Auth.
 * Reads credentials from .supabase-local.env or env vars, sets Convex env.
 */
import { readFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

function convexSiteUrl() {
  const local = readEnvFile(join(root, ".env.local"));
  if (local.CONVEX_SITE_URL) return local.CONVEX_SITE_URL;
  const match = local.CONVEX_URL?.match(/^https:\/\/(.+)\.convex\.cloud$/);
  return match ? `https://${match[1]}.convex.site` : null;
}

function isPlaceholder(value) {
  return !value || value.includes("your-client") || value.includes("GOCSPX-...");
}

async function prompt(label) {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(label);
  rl.close();
  return answer.trim();
}

function setConvexEnv(name, value) {
  const result = spawnSync("npx", ["convex", "env", "set", name, value], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`Failed to set ${name}`);
  }
}

const site = convexSiteUrl();
const callback = site ? `${site}/api/auth/callback/google` : null;

console.log("\n=== Convex Google OAuth setup ===\n");
if (callback) {
  console.log("Redirect URI (add in Google Cloud Console):");
  console.log(`  ${callback}\n`);
  console.log("Authorized JavaScript origin:");
  console.log("  http://localhost:5173\n");
}

const fileEnv = readEnvFile(join(root, ".supabase-local.env"));
let clientId = process.env.GOOGLE_CLIENT_ID ?? fileEnv.GOOGLE_CLIENT_ID;
let clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? fileEnv.GOOGLE_CLIENT_SECRET;

if (isPlaceholder(clientId)) clientId = "";
if (isPlaceholder(clientSecret)) clientSecret = "";

if (!clientId) {
  console.log("Create OAuth client: https://console.cloud.google.com/apis/credentials\n");
  clientId = await prompt("Google Client ID: ");
}
if (!clientSecret) {
  clientSecret = await prompt("Google Client Secret: ");
}

if (!clientId || !clientSecret) {
  console.error("Missing Google OAuth credentials.");
  process.exit(1);
}

setConvexEnv("AUTH_GOOGLE_ID", clientId);
setConvexEnv("AUTH_GOOGLE_SECRET", clientSecret);
setConvexEnv("SITE_URL", "http://localhost:5173");

console.log("\nDone. Google sign-in is configured on Convex.\n");
