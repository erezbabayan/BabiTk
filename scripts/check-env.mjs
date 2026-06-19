/**
 * Validate local .env files — run: node scripts/check-env.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const issues = [];
const ok = [];

function readEnv(path) {
  if (!existsSync(path)) return null;
  const map = new Map();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    map.set(t.slice(0, i), t.slice(i + 1));
  }
  return map;
}

const webEnv = readEnv(join(root, "web/.env"));
const backendEnv = readEnv(join(root, "backend/.env"));

if (!webEnv) {
  issues.push("web/.env missing — copy from web/.env.example");
} else if (webEnv.get("VITE_DEMO_MODE") === "true") {
  issues.push("web/.env: VITE_DEMO_MODE=true (set false for production)");
} else {
  ok.push("Web demo mode disabled");
}

if (!backendEnv) {
  issues.push("backend/.env missing");
} else {
  for (const key of ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const val = backendEnv.get(key);
    if (!val || val.includes("[project-ref]") || val.startsWith("eyJ...") || val === "sk-dev-placeholder") {
      issues.push(`backend/.env: ${key} not configured`);
    }
  }
  if (issues.length === 0) ok.push("Backend core env looks configured");
}

const linked = existsSync(join(root, "supabase/.temp/project-ref"));
if (linked) ok.push("Supabase project linked");
else issues.push("Supabase not linked — run scripts/setup-supabase.ps1");

console.log("=== MindTasker env check ===\n");
for (const line of ok) console.log(`✅ ${line}`);
for (const line of issues) console.log(`❌ ${line}`);
console.log(`\n${ok.length} ok, ${issues.length} issues`);
process.exit(issues.length > 0 ? 1 : 0);
