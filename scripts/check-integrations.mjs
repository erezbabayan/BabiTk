/**
 * Integration readiness checklist — run: node scripts/check-integrations.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function envVal(name, file = join(root, "backend/.env")) {
  if (!existsSync(file)) return "";
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith(`${name}=`)) return line.slice(name.length + 1).trim();
  }
  return "";
}

function whatsappConfigured() {
  const provider = (envVal("WHATSAPP_PROVIDER") || "meta").toLowerCase();
  if (provider === "green-api" || provider === "greenapi") {
    return Boolean(envVal("GREEN_API_INSTANCE_ID") && envVal("GREEN_API_TOKEN"));
  }
  if (provider === "whapi") {
    return Boolean(envVal("WHAPI_API_TOKEN"));
  }
  return Boolean(envVal("WHATSAPP_VERIFY_TOKEN") && envVal("WHATSAPP_ACCESS_TOKEN"));
}

const checks = [
  {
    name: "OpenAI",
    ok: Boolean(envVal("OPENAI_API_KEY")) && !envVal("OPENAI_API_KEY").includes("placeholder"),
    hint: "Set OPENAI_API_KEY in backend/.env",
  },
  {
    name: "Supabase",
    ok: Boolean(envVal("SUPABASE_URL")) && !envVal("SUPABASE_URL").includes("[project-ref]"),
    hint: "Run setup-supabase.ps1",
  },
  {
    name: "WhatsApp webhook",
    ok: whatsappConfigured(),
    hint:
      (envVal("WHATSAPP_PROVIDER") || "meta").toLowerCase() === "green-api"
        ? "Green-API → Webhook: https://api.YOUR_DOMAIN/api/whatsapp/webhook/inbound"
        : (envVal("WHATSAPP_PROVIDER") || "meta").toLowerCase() === "whapi"
          ? "Whapi → Webhook: https://api.YOUR_DOMAIN/api/whatsapp/webhook/inbound"
          : "Meta Developer Console → Webhook: https://api.YOUR_DOMAIN/api/whatsapp/webhook",
  },
  {
    name: "Stripe billing",
    ok: Boolean(envVal("STRIPE_SECRET_KEY") && envVal("STRIPE_PRICE_ID") && envVal("STRIPE_WEBHOOK_SECRET")),
    hint: "Stripe Dashboard → Webhook: /api/billing/webhook",
  },
  {
    name: "Google Calendar",
    ok: Boolean(envVal("GOOGLE_CLIENT_ID") && envVal("GOOGLE_CLIENT_SECRET")),
    hint: "Google Cloud Console → OAuth redirect: /api/integrations/google/callback",
  },
  {
    name: "Cron secret (multi-instance)",
    ok: Boolean(envVal("CRON_SECRET")),
    hint: "Set CRON_SECRET for HTTP cron routes",
  },
];

console.log("=== Integration checklist ===\n");
let pass = 0;
for (const c of checks) {
  if (c.ok) {
    console.log(`✅ ${c.name}`);
    pass++;
  } else {
    console.log(`❌ ${c.name} — ${c.hint}`);
  }
}
console.log(`\n${pass}/${checks.length} configured`);
process.exit(pass === checks.length ? 0 : 1);
