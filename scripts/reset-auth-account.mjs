#!/usr/bin/env node
/**
 * Remove password auth for an email so the user can register again.
 * Usage: node scripts/reset-auth-account.mjs [email]
 */
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const email = (process.argv[2] ?? "erezbabayan@gmail.com").trim().toLowerCase();
const convexBin = join(root, "node_modules", "convex", "bin", "main.js");

const result = spawnSync(
  process.execPath,
  [
    convexBin,
    "run",
    "authMaintenance:resetPasswordAccountByEmail",
    JSON.stringify({ email }),
  ],
  { cwd: root, encoding: "utf8" },
);

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exit(result.status ?? 1);
