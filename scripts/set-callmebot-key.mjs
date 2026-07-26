/**
 * Save a user's CallMeBot API key (from WhatsApp bot reply).
 *
 *   node scripts/set-callmebot-key.mjs --email erezbabayan@gmail.com --key YOUR_APIKEY
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || !process.argv[idx + 1]) return "";
  return process.argv[idx + 1].trim();
}

const email = readArg("--email");
const apiKey = readArg("--key");

if (!email || !apiKey) {
  console.error(
    "Usage: node scripts/set-callmebot-key.mjs --email user@example.com --key APIKEY",
  );
  process.exit(1);
}

const args = JSON.stringify({ email, apiKey });
const out = execSync(
  `npx convex run users:setCallMeBotKeyByEmail ${JSON.stringify(args)}`,
  { cwd: root, encoding: "utf8" },
);
console.log(out.trim());

if (process.argv.includes("--test")) {
  const testArgs = JSON.stringify(JSON.stringify({ email }));
  const test = execSync(
    `npx convex run reminders:sendTestWhatsApp ${testArgs}`,
    { cwd: root, encoding: "utf8" },
  );
  console.log(test.trim());
}
