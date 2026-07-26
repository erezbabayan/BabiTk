/**
 * Finish local user connection (demo / dev):
 * - Link WhatsApp phone in Convex
 * - Write backend/data/demo-user.json for backend lookups
 *
 * Phone source (first match wins):
 *   USER_PHONE, DEMO_USER_PHONE, BACKUP_NOTIFY_PHONES (from backend/.env)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ConvexHttpClient } from "convex/browser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const LEGACY_USER_ID = "00000000-0000-4000-8000-000000000001";

function loadConvexUrl() {
  const envLocal = readFileSync(join(root, ".env.local"), "utf8");
  const match = envLocal.match(/^CONVEX_URL=(.+)$/m);
  if (!match) throw new Error("CONVEX_URL missing from .env.local");
  return match[1].trim();
}

function readEnvValue(name, file = join(root, "backend/.env")) {
  if (!existsSync(file)) return "";
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith(`${name}=`)) {
      return line.slice(name.length + 1).trim();
    }
  }
  return "";
}

function resolvePhone() {
  const candidates = [
    process.env.USER_PHONE,
    process.env.DEMO_USER_PHONE,
    readEnvValue("DEMO_USER_PHONE"),
    readEnvValue("BACKUP_NOTIFY_PHONES")?.split(",")[0]?.trim(),
  ];

  for (const value of candidates) {
    if (value && value.length >= 10 && !value.includes("XXXX")) {
      return value;
    }
  }

  throw new Error(
    "No phone found. Set USER_PHONE or BACKUP_NOTIFY_PHONES in backend/.env",
  );
}

function writeDemoUserProfile(phone) {
  const dataDir = join(root, "backend/data");
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  const profile = {
    id: LEGACY_USER_ID,
    email: process.env.USER_EMAIL?.trim() || readEnvValue("USER_EMAIL") || "erezbabayan@gmail.com",
    phone,
    phone_verified: true,
    phone_pending: null,
  };

  writeFileSync(join(dataDir, "demo-user.json"), `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  return profile;
}

const phone = resolvePhone();
const { api } = await import(pathToFileURL(join(root, "convex/_generated/api.js")).href);
const client = new ConvexHttpClient(loadConvexUrl());

const existing = await client.query(api.users.getByLegacyId, { legacyId: LEGACY_USER_ID });
let userId = existing?._id;

if (!userId) {
  const created = await client.mutation(api.users.getOrCreateByLegacyId, {
    legacyId: LEGACY_USER_ID,
  });
  userId = created.userId;
}

const normalized = await client.mutation(api.users.linkVerifiedPhone, {
  userId,
  phone,
});

const profile = writeDemoUserProfile(normalized);

console.log("BabiTk user connection complete:");
console.log(`  legacy user: ${LEGACY_USER_ID}`);
console.log(`  convex user: ${userId}`);
console.log(`  phone:       ${normalized}`);
console.log(`  demo profile: backend/data/demo-user.json`);
console.log(`  email:       ${profile.email}`);
