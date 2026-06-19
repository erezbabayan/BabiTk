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

const { api } = await import(pathToFileURL(join(root, "convex/_generated/api.js")).href);

const syncPath = join(root, "backend/data/sync-items.json");
const payload = JSON.parse(readFileSync(syncPath, "utf8"));
const activeItems = payload.items.filter((item) => !item.deleted_at);
const userId = "00000000-0000-4000-8000-000000000001";

const client = new ConvexHttpClient(loadConvexUrl());
const CHUNK_SIZE = 5;
let imported = 0;

for (let index = 0; index < activeItems.length; index += CHUNK_SIZE) {
  const chunk = activeItems.slice(index, index + CHUNK_SIZE);
  const result = await client.mutation(api.seed.importSync, {
    legacyUserId: userId,
    items: chunk,
  });
  imported += result.tasks + result.notebooks;
  console.log(
    `Imported chunk ${index / CHUNK_SIZE + 1}: ${result.tasks} tasks, ${result.notebooks} notebooks`,
  );
}

console.log(`Seeded ${imported}/${activeItems.length} active items into Convex`);
