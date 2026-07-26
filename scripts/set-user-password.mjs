#!/usr/bin/env node
/**
 * Set password for an existing Convex Auth account (dev recovery).
 * Usage: node scripts/set-user-password.mjs <email> <newPassword>
 */
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const email = process.argv[2]?.trim().toLowerCase();
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: node scripts/set-user-password.mjs <email> <newPassword>");
  process.exit(1);
}

if (password.length < 8) {
  console.error("Password must be at least 8 characters");
  process.exit(1);
}

const convexBin = join(root, "node_modules", "convex", "bin", "main.js");

const result = spawnSync(
  process.execPath,
  [
    convexBin,
    "run",
    "authMaintenance:setPasswordByEmail",
    JSON.stringify({ email, password }),
  ],
  { cwd: root, encoding: "utf8" },
);

process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
process.exit(result.status ?? 1);
