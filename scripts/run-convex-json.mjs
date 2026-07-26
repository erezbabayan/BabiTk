/**
 * Run Convex CLI without PowerShell stripping JSON quotes.
 * Usage:
 *   node scripts/run-convex-json.mjs users:setCaptureGroupByEmail --file .wa-args.json
 *   node scripts/run-convex-json.mjs whatsappOps:checkGreenApiConnection
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const convexMain = join(root, "node_modules", "convex", "bin", "main.js");
const fn = process.argv[2];
if (!fn) {
  console.error("Usage: node scripts/run-convex-json.mjs <functionName> [--file path | '<json>']");
  process.exit(1);
}

let json = "{}";
const fileIdx = process.argv.indexOf("--file");
if (fileIdx >= 0) {
  const path = process.argv[fileIdx + 1];
  if (!path) {
    console.error("Missing path after --file");
    process.exit(1);
  }
  json = readFileSync(join(root, path), "utf8").trim();
} else if (process.argv[3]) {
  json = process.argv[3];
}

JSON.parse(json);

const result = spawnSync(
  process.execPath,
  [convexMain, "run", fn, json, "--typecheck", "disable"],
  { stdio: "inherit", cwd: root, env: process.env },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
