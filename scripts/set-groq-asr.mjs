/**
 * Set GROQ_API_KEY on Convex (and optionally backend/.env) for Hebrew ASR fallback.
 *
 * Usage:
 *   node scripts/set-groq-asr.mjs <GROQ_API_KEY>
 *   # or:
 *   $env:GROQ_API_KEY="gsk_..."; node scripts/set-groq-asr.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const key = (process.argv[2] ?? process.env.GROQ_API_KEY ?? "").trim();

if (!key || key.length < 20) {
  console.error(
    "Missing GROQ_API_KEY. Create one at https://console.groq.com/keys then run:\n" +
      "  node scripts/set-groq-asr.mjs gsk_your_key_here",
  );
  process.exit(1);
}

if (!key.startsWith("gsk_")) {
  console.warn("Warning: Groq keys usually start with gsk_ — continuing anyway.");
}

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const cleaned = line.replace(/#.*$/, "");
    const m = cleaned.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const name = m[1].trim();
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    if (name && value && !process.env[name]) process.env[name] = value;
  }
}

loadEnvLocal();

console.log("Setting GROQ_API_KEY on Convex…");
const setKey = spawnSync("npx", ["convex", "env", "set", "GROQ_API_KEY", key], {
  cwd: root,
  encoding: "utf8",
  shell: true,
  env: process.env,
});
if (setKey.status !== 0) {
  console.error(setKey.stdout || setKey.stderr || "convex env set failed");
  process.exit(setKey.status ?? 1);
}

console.log("Setting HEBREW_ASR_ENGINE=auto on Convex…");
spawnSync("npx", ["convex", "env", "set", "HEBREW_ASR_ENGINE", "auto"], {
  cwd: root,
  encoding: "utf8",
  shell: true,
  env: process.env,
});

const backendEnv = path.join(root, "backend", ".env");
if (fs.existsSync(backendEnv)) {
  let text = fs.readFileSync(backendEnv, "utf8");
  if (/^GROQ_API_KEY=/m.test(text)) {
    text = text.replace(/^GROQ_API_KEY=.*$/m, `GROQ_API_KEY=${key}`);
  } else {
    text = `${text.trimEnd()}\n\n# Hebrew ASR fallback (Groq Whisper)\nGROQ_API_KEY=${key}\n`;
  }
  if (!/^HEBREW_ASR_ENGINE=/m.test(text)) {
    text = `${text.trimEnd()}\nHEBREW_ASR_ENGINE=auto\n`;
  }
  fs.writeFileSync(backendEnv, text, "utf8");
  console.log("Updated backend/.env with GROQ_API_KEY");
}

console.log("Done. Voice transcription cascade: RunPod → Groq → OpenAI.");
console.log("Try a short recording in the app now.");
