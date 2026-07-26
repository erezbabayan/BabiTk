#!/usr/bin/env node
/**
 * Sets JWT_PRIVATE_KEY and JWKS on Convex from .convex-auth-keys.json
 */
import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const keysPath = join(root, ".convex-auth-keys.json");
const keys = JSON.parse(readFileSync(keysPath, "utf8"));

/** JWKS must be raw JSON — not shell-escaped or double-encoded. */
function normalizeJwks(value) {
  if (typeof value !== "string") {
    return JSON.stringify(value);
  }
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) {
    return JSON.stringify(JSON.parse(trimmed));
  }
  return trimmed;
}

function setEnvFromStdin(name, value) {
  const result = spawnSync("npx", ["convex", "env", "set", name, "--force"], {
    cwd: root,
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`Failed to set ${name}`);
  }
}

const jwks = normalizeJwks(keys.JWKS);
console.log("Setting JWKS (valid JSON)...");
setEnvFromStdin("JWKS", jwks);

console.log("Setting JWT_PRIVATE_KEY...");
setEnvFromStdin("JWT_PRIVATE_KEY", keys.JWT_PRIVATE_KEY);

console.log("Done.");
