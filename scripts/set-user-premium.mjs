#!/usr/bin/env node
/**
 * Grant Premium to a Supabase user (default: ארז בביאן).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/set-user-premium.mjs
 *   node scripts/set-user-premium.mjs erezbabayan@gmail.com
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_EMAIL = "erezbabayan@gmail.com";
const OWNER_USERNAMES = ["erezbababan", "erezbabayan"];

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
  for (const file of files) {
    Object.assign(merged, readEnvFile(file));
  }
  return merged;
}

/**
 * @param {string} url
 * @param {string} serviceKey
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function supabaseRest(url, serviceKey, path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
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
  console.error(
    "Missing SUPABASE_SERVICE_ROLE_KEY. Set it in the environment or backend/.env.",
  );
  process.exit(1);
}

const email = (process.argv[2] ?? DEFAULT_EMAIL).trim().toLowerCase();

/** @type {Array<{id: string, email: string | null, username: string | null, tier: string | null}>} */
let rows = await supabaseRest(
  supabaseUrl,
  serviceKey,
  `users?select=id,email,username,tier&email=ilike.${encodeURIComponent(email)}`,
);

if ((!Array.isArray(rows) || rows.length === 0) && email === DEFAULT_EMAIL) {
  const usernameFilter = OWNER_USERNAMES.map((name) => `"${name}"`).join(",");
  rows = await supabaseRest(
    supabaseUrl,
    serviceKey,
    `users?select=id,email,username,tier&username=in.(${usernameFilter})`,
  );
}

if (!Array.isArray(rows) || rows.length === 0) {
  console.error(`User not found: ${email}`);
  process.exit(1);
}

const ids = rows.map((row) => row.id).join(",");
const updated = await supabaseRest(
  supabaseUrl,
  serviceKey,
  `users?id=in.(${ids})`,
  {
    method: "PATCH",
    body: JSON.stringify({ tier: "premium" }),
  },
);

const resultRows = Array.isArray(updated) && updated.length > 0 ? updated : rows;
for (const row of resultRows) {
  console.log(
    `Premium granted: ${row.email ?? email} (username=${row.username ?? "—"}) id=${row.id} tier=${row.tier ?? "premium"}`,
  );
}
