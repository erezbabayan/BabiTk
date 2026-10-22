/**
 * Patch an Expo-generated android/app/build.gradle so release builds use the
 * CI keystore. Secrets stay in the environment; this file never reads them.
 */

const RELEASE_CONFIG = `
        // BABITK_RELEASE_SIGNING
        release {
            storeFile file("babitk-release.keystore")
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }`;

export function applyReleaseSigning(gradle, versionCode) {
  if (typeof gradle !== "string" || !gradle.includes("signingConfigs {")) {
    throw new Error("android/app/build.gradle is missing signingConfigs");
  }
  let next = gradle;
  if (!next.includes("BABITK_RELEASE_SIGNING")) {
    next = next.replace("signingConfigs {", `signingConfigs {${RELEASE_CONFIG}`);
  }
  const buildTypes = next.indexOf("buildTypes {");
  const releaseAt = next.indexOf("release {", buildTypes);
  const debugSigning = next.indexOf("signingConfig signingConfigs.debug", releaseAt);
  if (buildTypes < 0 || releaseAt < 0 || debugSigning < 0) {
    throw new Error("release buildType is missing signingConfig signingConfigs.debug");
  }
  next =
    next.slice(0, debugSigning) +
    "signingConfig signingConfigs.release" +
    next.slice(debugSigning + "signingConfig signingConfigs.debug".length);
  if (versionCode) {
    if (!/versionCode \d+/.test(next)) {
      throw new Error("versionCode was not found");
    }
    next = next.replace(/versionCode \d+/, `versionCode ${versionCode}`);
  }
  return next;
}
