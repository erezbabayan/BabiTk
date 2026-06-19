/**
 * Link a WhatsApp phone to the MindTasker user in Convex (dev/demo).
 *
 * Usage:
 *   $env:USER_PHONE="+972501234567"
 *   node scripts/link-user-phone.mjs
 *
 * Optional:
 *   $env:LEGACY_USER_ID="00000000-0000-4000-8000-000000000001"
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ConvexHttpClient } from "convex/browser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadConvexUrl() {
  const envLocal = readFileSync(join(root, ".env.local"), "utf8");
  const match = envLocal.match(/^CONVEX_URL=(.+)$/m);
  if (!match) throw new Error("CONVEX_URL missing from .env.local");
  return match[1].trim();
}

const phone = process.env.USER_PHONE?.trim();
if (!phone) {
  console.error("Missing USER_PHONE. Example: $env:USER_PHONE=\"+972501234567\"");
  process.exit(1);
}

const legacyUserId =
  process.env.LEGACY_USER_ID?.trim() ?? "00000000-0000-4000-8000-000000000001";

const { api } = await import(pathToFileURL(join(root, "convex/_generated/api.js")).href);
const client = new ConvexHttpClient(loadConvexUrl());

const existing = await client.query(api.users.getByLegacyId, { legacyId: legacyUserId });
let userId = existing?._id;

if (!userId) {
  const created = await client.mutation(api.users.getOrCreateByLegacyId, {
    legacyId: legacyUserId,
  });
  userId = created.userId;
}

const normalized = await client.mutation(api.users.linkVerifiedPhone, {
  userId,
  phone,
});

console.log(`Linked ${normalized} to legacy user ${legacyUserId} (Convex id: ${userId})`);
