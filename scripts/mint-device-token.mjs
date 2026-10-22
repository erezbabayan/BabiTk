#!/usr/bin/env node
/**
 * Mint a voice-ingest device token. Prints the plaintext once and stores SHA-256 only.
 *
 *   node --experimental-strip-types scripts/mint-device-token.mjs erezbabayan@gmail.com
 *   node --experimental-strip-types scripts/mint-device-token.mjs --email erezbabayan@gmail.com --name "Raspberry Pi"
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateDeviceToken, hashDeviceToken } from "../supabase/functions/_shared/device-voice-ingest.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  /** @type {Record<string, string>} */
  const values = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function loadEnv() {
  const files = [
    join(root, ".env.local"),
    join(root, ".env.production"),
    join(root, "backend", ".env"),
    join(root, "backend", ".env.local"),
  ];
  /** @type {Record<string, string>} */
  const merged = {};
  for (const file of files) Object.assign(merged, readEnvFile(file));
  return merged;
}

function parseArgs(argv) {
  let email = "";
  let name = "Raspberry Pi";
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--email") {
      email = argv[index + 1]?.trim() ?? "";
      index += 1;
    } else if (arg === "--name") {
      name = argv[index + 1]?.trim() || name;
      index += 1;
    } else if (!arg.startsWith("--")) {
      positional.push(arg);
    }
  }
  return {
    email: (email || positional[0] || "erezbabayan@gmail.com").trim().toLowerCase(),
    name,
  };
}

const fileEnv = loadEnv();
const supabaseUrl = (
  process.env.SUPABASE_URL?.trim() ||
  process.env.VITE_SUPABASE_URL?.trim() ||
  fileEnv.SUPABASE_URL ||
  fileEnv.VITE_SUPABASE_URL ||
  "https://ghibfuinantybqidwadj.supabase.co"
).replace(/\/$/, "");
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY. Set it in the environment or backend/.env.");
  process.exit(1);
}

const { email, name } = parseArgs(process.argv.slice(2));

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function supabaseRest(path, init = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String(body.message)
        : text || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

const rows = await supabaseRest(
  `users?select=id,email&email=ilike.${encodeURIComponent(email)}`,
);
if (!Array.isArray(rows) || rows.length === 0 || typeof rows[0]?.id !== "string") {
  console.error(`User not found: ${email}`);
  process.exit(1);
}

const token = generateDeviceToken();
const tokenHash = await hashDeviceToken(token);
const inserted = await supabaseRest("device_tokens", {
  method: "POST",
  body: JSON.stringify({
    user_id: rows[0].id,
    name,
    token_hash: tokenHash,
  }),
});
const id = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;

console.log("Device token (shown once; only the hash is stored):");
console.log(token);
console.log("");
console.log(`user: ${email}`);
console.log(`name: ${name}`);
console.log(`id: ${id ?? ""}`);
console.log(`endpoint: ${supabaseUrl}/functions/v1/voice-ingest`);
