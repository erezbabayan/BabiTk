/**
 * Seed Convex from backend/data/sync-items.json.
 * Uses the admin CLI (`seed:importSync` is internal) so the public API
 * cannot import or overwrite another user's board.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const CHUNK_SIZE = 5;
const convexMain = join(root, "node_modules", "convex", "bin", "main.js");

const syncPath = join(root, "backend/data/sync-items.json");
const payload = JSON.parse(readFileSync(syncPath, "utf8"));
const activeItems = payload.items.filter((item) => !item.deleted_at);
const legacyUserId = "00000000-0000-4000-8000-000000000001";

function importChunk(items) {
  const args = JSON.stringify({ legacyUserId, items });
  const result = spawnSync(
    process.execPath,
    [convexMain, "run", "seed:importSync", args, "--typecheck", "disable"],
    { cwd: root, encoding: "utf8", env: process.env },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "convex run failed\n");
    process.exit(result.status ?? 1);
  }
  const text = (result.stdout ?? "").trim();
  const start = text.lastIndexOf("{");
  if (start < 0) {
    throw new Error(`convex run did not return JSON:\n${text}`);
  }
  return JSON.parse(text.slice(start));
}

let tasks = 0;
let notebooks = 0;

for (let index = 0; index < activeItems.length; index += CHUNK_SIZE) {
  const chunk = activeItems.slice(index, index + CHUNK_SIZE);
  const result = importChunk(chunk);
  tasks += result.tasks;
  notebooks += result.notebooks;
  console.log(
    `Imported chunk ${index / CHUNK_SIZE + 1}: ${result.tasks} tasks, ${result.notebooks} notebooks`,
  );
}

console.log(
  `Seeded BabiTk: ${tasks} tasks, ${notebooks} notebooks (${activeItems.length} items)`,
);
