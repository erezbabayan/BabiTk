import { readFileSync, writeFileSync } from "node:fs";

import { applyReleaseSigning } from "./apply-android-release-signing.mjs";

const gradlePath = process.argv[2];
if (!gradlePath) {
  console.error("usage: node scripts/apply-android-release-signing-cli.mjs android/app/build.gradle");
  process.exit(1);
}

const versionCode = process.env.ANDROID_VERSION_CODE?.trim() || "";
const patched = applyReleaseSigning(readFileSync(gradlePath, "utf8"), versionCode);
writeFileSync(gradlePath, patched);
