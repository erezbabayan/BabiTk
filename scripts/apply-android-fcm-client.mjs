/**
 * Write mobile/google-services.json from GOOGLE_SERVICES_JSON when that env
 * var is set, and point app.json at it. Missing config is a warning: the APK
 * still builds, and Expo push tokens stay unavailable until the secret exists.
 *
 * Never print the JSON. A Firebase service-account private key must not be
 * baked into the APK — that key is uploaded to Expo (eas credentials) instead.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "com.mindtasker.app";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.ANDROID_FCM_ROOT
  ? path.resolve(process.env.ANDROID_FCM_ROOT)
  : path.resolve(here, "..");
const appJsonPath = path.join(root, "mobile", "app.json");
const outPath = path.join(root, "mobile", "google-services.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

const raw = process.env.GOOGLE_SERVICES_JSON ?? "";
if (!raw.trim()) {
  console.log(
    "GOOGLE_SERVICES_JSON is not set. The APK will not include Firebase config, so Android Expo push tokens cannot be issued until this GitHub Actions secret is set.",
  );
  process.exit(0);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  fail("GOOGLE_SERVICES_JSON is not valid JSON. Expected the Firebase Android google-services.json file.");
}

if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
  fail("GOOGLE_SERVICES_JSON must be a JSON object (Firebase google-services.json).");
}

if (parsed.type === "service_account" || typeof parsed.private_key === "string") {
  fail(
    "GOOGLE_SERVICES_JSON looks like a Firebase service account key. Do not put that key in the APK. Upload it with `eas credentials` → Android → Google Service Account Key for Push Notifications (FCM V1). The GitHub secret must be the Android google-services.json instead.",
  );
}

const clients = Array.isArray(parsed.client) ? parsed.client : [];
const matchesPackage = clients.some(
  (client) => client?.client_info?.android_client_info?.package_name === PACKAGE_NAME,
);
if (!parsed.project_info || typeof parsed.project_info !== "object" || !matchesPackage) {
  fail(
    `GOOGLE_SERVICES_JSON has no Firebase Android client for package ${PACKAGE_NAME}. Download google-services.json for that package from the Firebase console.`,
  );
}

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });

const app = JSON.parse(readFileSync(appJsonPath, "utf8"));
if (!app.expo || typeof app.expo !== "object") fail("mobile/app.json is missing expo.");
app.expo.android = app.expo.android && typeof app.expo.android === "object" ? app.expo.android : {};
app.expo.android.googleServicesFile = "./google-services.json";
writeFileSync(appJsonPath, `${JSON.stringify(app, null, 2)}\n`);
console.log(`Wrote Firebase Android config for ${PACKAGE_NAME}.`);
