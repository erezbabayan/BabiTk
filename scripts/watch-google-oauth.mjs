#!/usr/bin/env node
/**
 * Watches .google-oauth.local.env and applies credentials to Convex when ready.
 * Run: node scripts/watch-google-oauth.mjs
 */
import { existsSync, readFileSync, watch } from "fs";
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".google-oauth.local.env");
const applyScript = join(root, "scripts", "apply-google-oauth.mjs");

function hasRealCredentials() {
  if (!existsSync(envPath)) return false;
  const text = readFileSync(envPath, "utf8");
  const id = text.match(/^GOOGLE_CLIENT_ID=(.+)$/m)?.[1]?.trim() ?? "";
  const secret = text.match(/^GOOGLE_CLIENT_SECRET=(.+)$/m)?.[1]?.trim() ?? "";
  if (!id || !secret) return false;
  if (id.includes("YOUR_ID") || secret.includes("your-secret")) return false;
  return id.endsWith(".apps.googleusercontent.com") && secret.startsWith("GOCSPX-");
}

function apply() {
  console.log("Applying Google OAuth to Convex...");
  const result = spawnSync(process.execPath, [applyScript], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status === 0) {
    console.log("\nGoogle login is ready. Refresh http://localhost:5173\n");
    process.exit(0);
  }
}

if (hasRealCredentials()) {
  apply();
}

if (!existsSync(envPath)) {
  const example = join(root, ".google-oauth.local.env.example");
  if (existsSync(example)) {
    const { copyFileSync } = await import("fs");
    copyFileSync(example, envPath);
    console.log(`Created ${envPath} — paste your Google credentials and save.`);
  }
}

console.log("Watching for Google OAuth credentials...");
watch(envPath, { persistent: true }, () => {
  if (hasRealCredentials()) apply();
});
