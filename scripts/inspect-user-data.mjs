/**
 * Inspect users and item counts in Convex for data restore planning.
 * Run: node scripts/inspect-user-data.mjs [email]
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const email = process.argv[2] ?? "erezbabayan@gmail.com";
const LEGACY_DEMO_ID = "00000000-0000-4000-8000-000000000001";

function loadConvexUrl() {
  const envLocal = readFileSync(join(root, ".env.local"), "utf8");
  const match = envLocal.match(/^CONVEX_URL=(.+)$/m);
  if (!match) throw new Error("CONVEX_URL missing");
  return match[1].trim();
}

const client = new ConvexHttpClient(loadConvexUrl());

const byLegacy = await client.query(api.users.getByLegacyId, { legacyId: LEGACY_DEMO_ID });
console.log("\n=== Legacy demo user ===");
console.log(JSON.stringify(byLegacy, null, 2));

// Use internal approach - we need a query. Let me use getOrCreate to not create, only getByLegacyId
// For email lookup we need a new query or scan - write inline script using convex run

console.log("\nTarget email:", email);
