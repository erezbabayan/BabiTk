#!/usr/bin/env node
/**
 * Apply Google OAuth credentials to Convex Auth from .google-oauth.local.env
 */
import { existsSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const convexBin = join(root, "node_modules", "convex", "bin", "main.js");
const envPath = join(root, ".google-oauth.local.env");

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

function setEnv(name, value) {
  const result = spawnSync(
    process.execPath,
    [convexBin, "env", "set", name, value],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    throw new Error(`Failed to set ${name}`);
  }
  console.log(`Set ${name}`);
}

const fileEnv = readEnvFile(envPath);
const clientId = process.env.GOOGLE_CLIENT_ID ?? fileEnv.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? fileEnv.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret || clientId.includes("YOUR_ID")) {
  console.error(`
Missing Google OAuth credentials.

1. Run: .\\scripts\\open-google-oauth-setup.ps1
2. Create OAuth client in Google Cloud Console
3. Save credentials to: .google-oauth.local.env

Example:
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx
`);
  process.exit(1);
}

setEnv("AUTH_GOOGLE_ID", clientId);
setEnv("AUTH_GOOGLE_SECRET", clientSecret);
setEnv("SITE_URL", "http://localhost:5173");

console.log("\nGoogle sign-in is configured on Convex. Refresh the app and try again.\n");
