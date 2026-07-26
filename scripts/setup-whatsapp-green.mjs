/**
 * Apply Green-API credentials to Convex appSettings (+ optional env),
 * then optionally send a WhatsApp test to ארז בביאן.
 *
 *   node scripts/setup-whatsapp-green.mjs --instance ID --token TOKEN [--test]
 *   # or fill .whatsapp.local.env and:
 *   node scripts/setup-whatsapp-green.mjs [--test]
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".whatsapp.local.env");
const sendTest = process.argv.includes("--test");
const alsoConvexEnv = process.argv.includes("--env");

function readArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || !process.argv[idx + 1]) return "";
  return process.argv[idx + 1].trim();
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function upsertBackendEnv(vars) {
  const backendEnv = join(root, "backend", ".env");
  if (!existsSync(backendEnv)) {
    console.warn("backend/.env missing — skipped backend update");
    return;
  }
  let text = readFileSync(backendEnv, "utf8");
  const set = (key, value) => {
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(text)) {
      text = text.replace(re, `${key}=${value}`);
    } else {
      text = `${text.trimEnd()}\n${key}=${value}\n`;
    }
  };
  set("WHATSAPP_PROVIDER", "green-api");
  for (const [key, value] of Object.entries(vars)) {
    if (value) set(key, value);
  }
  writeFileSync(backendEnv, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  console.log("Updated backend/.env → WHATSAPP_PROVIDER=green-api (+ Green-API keys)");
}

function convexEnvSet(key, value) {
  execSync(`npx convex env set ${key} ${JSON.stringify(value)}`, {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
}

function writeLocalEnv(instanceId, token, url, webhookToken) {
  const body = [
    "# Auto-written by setup-whatsapp-green.mjs — do not commit",
    `GREEN_API_URL=${url}`,
    `GREEN_API_INSTANCE_ID=${instanceId}`,
    `GREEN_API_TOKEN=${token}`,
    webhookToken ? `GREEN_API_WEBHOOK_TOKEN=${webhookToken}` : "",
    "",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
  writeFileSync(envPath, body, "utf8");
}

const fileEnv = parseEnvFile(envPath);
const instanceId =
  readArg("--instance") || (fileEnv.GREEN_API_INSTANCE_ID ?? "").trim();
const token = readArg("--token") || (fileEnv.GREEN_API_TOKEN ?? "").trim();
const url =
  readArg("--url") ||
  (fileEnv.GREEN_API_URL ?? "https://api.greenapi.com").trim();
const webhookToken =
  readArg("--webhook-token") || (fileEnv.GREEN_API_WEBHOOK_TOKEN ?? "").trim();

if (!instanceId || !token || token.length < 8) {
  console.error(
    "Missing credentials.\n\n" +
      "  node scripts/setup-whatsapp-green.mjs --instance ID --token TOKEN --test\n\n" +
      "Or copy .whatsapp.local.env.example → .whatsapp.local.env and fill keys.\n" +
      "Get them from https://console.green-api.com/ after QR authorize.",
  );
  process.exit(1);
}

writeLocalEnv(instanceId, token, url, webhookToken);

console.log("Saving Green-API into Convex appSettings…");
const saveArgs = JSON.stringify({ instanceId, token, baseUrl: url });
const saveOut = execSync(
  `npx convex run whatsappConfig:setGreenApiCredentialsInternal ${JSON.stringify(saveArgs)}`,
  { cwd: root, encoding: "utf8" },
);
console.log(saveOut.trim());

if (alsoConvexEnv) {
  console.log("Also setting Convex env (GREEN_API_*)…");
  convexEnvSet("GREEN_API_INSTANCE_ID", instanceId);
  convexEnvSet("GREEN_API_TOKEN", token);
  convexEnvSet("GREEN_API_URL", url);
  convexEnvSet("WHATSAPP_PROVIDER", "green-api");
  if (webhookToken) {
    convexEnvSet("GREEN_API_WEBHOOK_TOKEN", webhookToken);
  }
}

upsertBackendEnv({
  GREEN_API_URL: url,
  GREEN_API_INSTANCE_ID: instanceId,
  GREEN_API_TOKEN: token,
  GREEN_API_WEBHOOK_TOKEN: webhookToken || undefined,
});

console.log("\nOutbound status:");
execSync(`npx convex run whatsappSend:sendStatus '{}'`, {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

if (sendTest) {
  console.log("\nSending WhatsApp test to ארז בביאן…");
  const testArgs = JSON.stringify({
    email: "erezbabayan@gmail.com",
  });
  execSync(`npx convex run reminders:sendTestWhatsApp ${JSON.stringify(testArgs)}`, {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
}

console.log(`
Done. Digests will use Green-API for +972526448067 once the instance is authorized (QR).
`);
