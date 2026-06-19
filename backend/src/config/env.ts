import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

const backendRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../..",
);

export const env = {
  get port() {
    return Number(process.env.PORT ?? 3001);
  },
  get openaiApiKey() {
    return requireEnv("OPENAI_API_KEY");
  },
  get openaiParseModel() {
    return process.env.OPENAI_PARSE_MODEL ?? "gpt-4o-mini";
  },
  get openaiWhisperModel() {
    return process.env.OPENAI_WHISPER_MODEL ?? "whisper-1";
  },
  get openaiVisionModel() {
    return process.env.OPENAI_VISION_MODEL ?? "gpt-4o";
  },
  get ocrMaxWidth() {
    return Number(process.env.OCR_MAX_WIDTH ?? 400);
  },
  get ocrMaxHeight() {
    return Number(process.env.OCR_MAX_HEIGHT ?? 512);
  },
  get ocrJpegQuality() {
    return Number(process.env.OCR_JPEG_QUALITY ?? 40);
  },
  get databaseUrl() {
    return optionalEnv("DATABASE_URL");
  },
  get supabaseUrl() {
    return optionalEnv("SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  },
  get supabaseAnonKey() {
    return optionalEnv("SUPABASE_ANON_KEY");
  },
  get whatsappVerifyToken() {
    return optionalEnv("WHATSAPP_VERIFY_TOKEN");
  },
  get whatsappAccessToken() {
    return optionalEnv("WHATSAPP_ACCESS_TOKEN");
  },
  get whatsappAppSecret() {
    return optionalEnv("WHATSAPP_APP_SECRET");
  },
  get whatsappPhoneNumberId() {
    return optionalEnv("WHATSAPP_PHONE_NUMBER_ID");
  },
  get whatsappGraphApiVersion() {
    return process.env.WHATSAPP_GRAPH_API_VERSION ?? "v21.0";
  },
  get whatsappProvider() {
    const raw = (process.env.WHATSAPP_PROVIDER ?? "meta").toLowerCase();
    if (raw === "green-api" || raw === "greenapi" || raw === "green_api") {
      return "green-api" as const;
    }
    if (raw === "whapi" || raw === "whapi.cloud") {
      return "whapi" as const;
    }
    return "meta" as const;
  },
  get greenApiUrl() {
    return (process.env.GREEN_API_URL ?? "https://api.greenapi.com").replace(/\/$/, "");
  },
  get greenApiInstanceId() {
    return optionalEnv("GREEN_API_INSTANCE_ID");
  },
  get greenApiToken() {
    return optionalEnv("GREEN_API_TOKEN");
  },
  get greenApiWebhookToken() {
    return optionalEnv("GREEN_API_WEBHOOK_TOKEN");
  },
  get whapiApiToken() {
    return optionalEnv("WHAPI_API_TOKEN");
  },
  get whapiWebhookToken() {
    return optionalEnv("WHAPI_WEBHOOK_TOKEN");
  },
  get whatsappInboundWebhookToken() {
    return optionalEnv("WHATSAPP_INBOUND_WEBHOOK_TOKEN");
  },
  get backupEnabled() {
    return (process.env.BACKUP_ENABLED ?? "true").toLowerCase() === "true";
  },
  get backupDir() {
    return path.resolve(backendRoot, process.env.BACKUP_DIR ?? "../backups");
  },
  get backupRetentionCount() {
    return Number(process.env.BACKUP_RETENTION_COUNT ?? 14);
  },
  get backupStorageBucket() {
    return process.env.BACKUP_STORAGE_BUCKET ?? "source-materials";
  },
  get backupTimezone() {
    return process.env.BACKUP_TIMEZONE ?? "Asia/Jerusalem";
  },
  get backupNotifyEnabled() {
    return (process.env.BACKUP_NOTIFY_ENABLED ?? "true").toLowerCase() === "true";
  },
  get backupNotifyPhones() {
    return optionalEnv("BACKUP_NOTIFY_PHONES");
  },
  get webAppUrl() {
    return process.env.WEB_APP_URL ?? "http://localhost:5173";
  },
  get androidAppUrl() {
    return process.env.ANDROID_APP_URL ?? "mindtasker://home";
  },
  get cronEnabled() {
    return (process.env.CRON_ENABLED ?? "true").toLowerCase() === "true";
  },
  get cronTimezone() {
    return process.env.CRON_TIMEZONE ?? "Asia/Jerusalem";
  },
  get cronSecret() {
    return optionalEnv("CRON_SECRET");
  },
  get googleClientId() {
    return optionalEnv("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return optionalEnv("GOOGLE_CLIENT_SECRET");
  },
  get googleRedirectUri() {
    return optionalEnv("GOOGLE_REDIRECT_URI");
  },
  get stripeSecretKey() {
    return optionalEnv("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return optionalEnv("STRIPE_WEBHOOK_SECRET");
  },
  get stripePriceId() {
    return optionalEnv("STRIPE_PRICE_ID");
  },
  get corsOrigins() {
    const raw = optionalEnv("CORS_ORIGINS");
    if (!raw) return null;
    return raw.split(",").map((o) => o.trim()).filter(Boolean);
  },
  get isDevelopment() {
    return (process.env.NODE_ENV ?? "development") !== "production";
  },
  get isSupabaseConfigured() {
    const url = optionalEnv("SUPABASE_URL");
    const key = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return false;
    if (url.includes("[project-ref]") || key.startsWith("eyJ...")) return false;
    return true;
  },
  get demoSyncEnabled() {
    return (process.env.DEMO_SYNC_ENABLED ?? "true").toLowerCase() === "true";
  },
  get demoSyncToken() {
    return process.env.DEMO_SYNC_TOKEN ?? "mindtasker-local-sync";
  },
} as const;
