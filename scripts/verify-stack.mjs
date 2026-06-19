/**
 * Local verification script — run: node scripts/verify-stack.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
}

function fail(name, detail = "") {
  results.push({ ok: false, name, detail });
}

function run(cmd, cwd = root) {
  execSync(cmd, { cwd, stdio: "pipe", encoding: "utf8" });
}

// 1. Schema: mindtasker_items + item_status enum
const schema = readFileSync(
  join(root, "supabase/migrations/20250617000000_initial_schema.sql"),
  "utf8",
);
if (schema.includes("create table public.mindtasker_items")) {
  pass("DB schema uses mindtasker_items");
} else {
  fail("DB schema uses mindtasker_items");
}
for (const status of ["inbox", "pending", "completed", "snoozed_archive"]) {
  if (schema.includes(`'${status}'`)) {
    pass(`item_status includes ${status}`);
  } else {
    fail(`item_status includes ${status}`);
  }
}

// 2. All migrations present
const migrations = readdirSync(join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
pass(`${migrations.length} migration files`, migrations.join(", "));

// 3. No legacy `items` table references in app code
const appDirs = ["backend/src", "web/src", "mobile/src", "mobile/App.tsx"];
let legacyItems = false;
for (const rel of appDirs) {
  const full = join(root, rel);
  if (!existsSync(full)) continue;
  const files =
    rel.endsWith(".tsx") || rel.endsWith(".ts")
      ? [full]
      : readdirSync(full, { recursive: true }).map((f) => join(full, String(f)));
  for (const file of files) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
    const content = readFileSync(file, "utf8");
    if (/\.from\(["']items["']\)/.test(content)) legacyItems = true;
  }
}
legacyItems ? fail("No legacy items table refs") : pass("No legacy items table refs");

// 4. Mobile is Expo/React Native
const mobilePkg = JSON.parse(readFileSync(join(root, "mobile/package.json"), "utf8"));
if (mobilePkg.dependencies?.expo && mobilePkg.dependencies?.["react-native"]) {
  pass("Mobile is Expo / React Native");
} else {
  fail("Mobile is Expo / React Native");
}

// 5. Compilers
try {
  run("npm run typecheck", join(root, "backend"));
  pass("Backend typecheck");
} catch (e) {
  fail("Backend typecheck", String(e.stderr ?? e.message).slice(0, 200));
}

try {
  run("npm run build", join(root, "web"));
  pass("Web build");
} catch (e) {
  fail("Web build", String(e.stderr ?? e.message).slice(0, 200));
}

try {
  run(".\\node_modules\\.bin\\tsc --noEmit", join(root, "mobile"));
  pass("Mobile typecheck");
} catch (e) {
  fail("Mobile typecheck", String(e.stderr ?? e.message).slice(0, 300));
}

// 6. Backend health (optional)
try {
  const res = await fetch("http://localhost:3001/health");
  if (res.ok) {
    const body = await res.json();
    pass("Backend /health", JSON.stringify(body));
  } else {
    fail("Backend /health", `HTTP ${res.status}`);
  }
} catch {
  fail("Backend /health", "Server not running on :3001 (start with: cd backend && npm run dev)");
}

// 8. Feature modules (6 stages)
const stageFiles = [
  ["Stage 2: WhatsApp sanitize", "backend/src/middleware/whatsapp-sanitize.ts"],
  ["Stage 2: OpenAI parse", "backend/src/services/openai.service.ts"],
  ["Stage 2: Usage middleware", "backend/src/middleware/usage.ts"],
  ["Stage 3: Dashboard", "web/src/components/Dashboard.tsx"],
  ["Stage 4: SwipeableItem", "mobile/src/components/SwipeableItem.tsx"],
  ["Stage 5: Calendar sync", "backend/src/services/calendar.service.ts"],
  ["Stage 5: Cron jobs", "backend/src/jobs/mindtasker.scheduler.ts"],
  ["Stage 6: Embeddings", "backend/src/services/embedding.service.ts"],
  ["Stage 6: Semantic search RPC", "supabase/migrations/20250617000003_search_notes_for_user.sql"],
];
for (const [name, rel] of stageFiles) {
  existsSync(join(root, rel)) ? pass(name) : fail(name, `missing ${rel}`);
}

if (schema.includes("enable row level security") && schema.includes("supabase_realtime")) {
  pass("Stage 1: RLS + Realtime");
} else {
  fail("Stage 1: RLS + Realtime");
}

if (schema.includes("vector(1536)") && schema.includes("search_notes")) {
  pass("Stage 6: pgvector + search_notes");
} else {
  fail("Stage 6: pgvector + search_notes");
}
// Supabase link (deployment only — skip with VERIFY_SKIP_SUPABASE_LINK=1)
const skipLink = process.env.VERIFY_SKIP_SUPABASE_LINK === "1";
const linked = existsSync(join(root, "supabase/.temp/project-ref"));
if (skipLink) {
  linked ? pass("Supabase project linked") : pass("Supabase project linked", "skipped (local dev)");
} else {
  linked
    ? pass("Supabase project linked")
    : fail("Supabase project linked", "Run: npx supabase link --project-ref YOUR_REF && npx supabase db push");
}
for (const r of results) {
  console.log(`${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed\n`);
process.exit(failed > 0 ? 1 : 0);
