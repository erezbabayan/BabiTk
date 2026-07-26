#!/usr/bin/env node
/**
 * Restore board data from legacy demo user to Convex Auth account by email.
 * Run: node scripts/restore-user-data.mjs [email]
 */
import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const email = process.argv[2] ?? "erezbabayan@gmail.com";
const argsPath = join(root, ".restore-user-args.json");

writeFileSync(argsPath, JSON.stringify({ email }), "utf8");

const result = spawnSync(
  "npx",
  [
    "convex",
    "run",
    "internal/adminRestore:restoreDataToAuthUser",
    JSON.stringify({ email }),
  ],
  { cwd: root, stdio: "inherit", shell: true },
);

unlinkSync(argsPath);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
