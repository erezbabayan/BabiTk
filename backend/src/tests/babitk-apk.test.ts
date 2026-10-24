import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { BABITK_APK_LABEL, BABITK_APK_URL } from "../../../convex/lib/babitkApk.ts";
import { applyReleaseSigning } from "../../../scripts/apply-android-release-signing.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");

const GRADLE = `
android {
    defaultConfig {
        versionCode 1
        versionName "1.0.0"
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}
`;

describe("BabiTk Android release", () => {
  it("points the download button at the stable release asset", () => {
    assert.equal(
      BABITK_APK_URL,
      "https://github.com/erezbabayan/BabiTk/releases/latest/download/BabiTk.apk",
    );
    assert.equal(BABITK_APK_LABEL, "הורידו את אפליקציית BabiTk");
    const settings = readFileSync(path.join(ROOT, "web/src/components/SettingsPanel.tsx"), "utf8");
    const login = readFileSync(path.join(ROOT, "web/src/components/LoginScreen.tsx"), "utf8");
    const download = readFileSync(path.join(ROOT, "web/src/components/AppDownloadLink.tsx"), "utf8");
    const mobileSettings = readFileSync(
      path.join(ROOT, "mobile/src/components/SettingsScreen.tsx"),
      "utf8",
    );
    assert.match(settings, /AppDownloadLink/);
    assert.match(login, /AppDownloadLink/);
    assert.match(download, /MindTaskerLogo/);
    assert.match(download, /variant="mark"/);
    assert.match(download, /\[&_svg\]:h-\[20px\]/);
    assert.doesNotMatch(download, /babitk-logo\.webp/);
    const labelAt = download.indexOf("{BABITK_APK_LABEL}");
    const logoAt = download.indexOf("<MindTaskerLogo");
    assert.ok(labelAt >= 0 && logoAt > labelAt);
    assert.match(settings, /<AppDownloadLink\s+logo/);
    assert.doesNotMatch(login, /AppDownloadLink\s+logo/);
    assert.match(settings, /babisnap-logo\.webp/);
    assert.match(settings, /h-\[20px\] w-\[20px\] shrink-0 rounded-full/);
    assert.match(mobileSettings, /babisnap-logo\.webp/);
    assert.match(mobileSettings, /width: 20, height: 20/);
    assert.match(mobileSettings, /logo=\{babisnapLogo\} label="BabiSnap"/);
    assert.doesNotMatch(mobileSettings, /icon="mic" label="BabiSnap"/);
  });

  it("signs only the release build and does not embed secrets", () => {
    const patched = applyReleaseSigning(GRADLE, "41");
    assert.match(patched, /BABITK_RELEASE_SIGNING/);
    assert.match(patched, /storeFile file\("babitk-release.keystore"\)/);
    assert.match(patched, /System\.getenv\("ANDROID_KEYSTORE_PASSWORD"\)/);
    assert.match(patched, /versionCode 41/);
    assert.match(patched, /debug \{\s*signingConfig signingConfigs\.debug/);
    assert.match(patched, /release \{\s*signingConfig signingConfigs\.release/);
    assert.doesNotMatch(patched, /storePassword "/);
  });

  it("adds a separate release workflow and store placeholders", () => {
    const workflow = readFileSync(path.join(ROOT, ".github/workflows/android-release.yml"), "utf8");
    const ci = readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
    const deploy = readFileSync(path.join(ROOT, ".github/workflows/deploy.yml"), "utf8");
    const signing = readFileSync(path.join(ROOT, "store/SIGNING.md"), "utf8");
    const listing = readFileSync(path.join(ROOT, "store/listing.he.md"), "utf8");
    assert.match(workflow, /branches: \[main\]/);
    assert.match(workflow, /tags: \["v\*"\]/);
    assert.match(workflow, /BabiTk\.apk/);
    assert.match(workflow, /upload-artifact@[0-9a-f]{40} # v4/);
    assert.match(workflow, /name: BabiTk-aab/);
    assert.match(workflow, /ANDROID_KEYSTORE_BASE64/);
    assert.match(workflow, /ANDROID_KEYSTORE_PASSWORD/);
    assert.match(workflow, /ANDROID_KEY_ALIAS/);
    assert.match(workflow, /ANDROID_KEY_PASSWORD/);
    assert.match(workflow, /base64 -d > mobile\/android\/app\/babitk-release\.keystore/);
    assert.match(workflow, /ndk;\$\{ndk:-27\.1\.12297006\}/);
    assert.match(workflow, /android-actions\/setup-android@[0-9a-f]{40} # v4/);
    assert.match(workflow, /Require Supabase public env/);
    assert.match(workflow, /EXPO_PUBLIC_SUPABASE_URL/);
    assert.match(workflow, /mobile\/\.env/);
    const googleAuth = readFileSync(path.join(ROOT, "mobile/src/lib/google-auth.ts"), "utf8");
    const authConfig = readFileSync(path.join(ROOT, "scripts/configure-supabase-auth.mjs"), "utf8");
    const mobileLogin = readFileSync(path.join(ROOT, "mobile/src/components/LoginScreen.tsx"), "utf8");
    const logo = readFileSync(path.join(ROOT, "mobile/src/components/MindTaskerLogo.tsx"), "utf8");
    const mobileAuth = readFileSync(path.join(ROOT, "mobile/src/hooks/useAuth.ts"), "utf8");
    const appJson = readFileSync(path.join(ROOT, "mobile/app.json"), "utf8");
    assert.match(googleAuth, /mindtasker:\/\/auth-callback/);
    assert.match(authConfig, /mindtasker:\/\/auth-callback/);
    assert.match(mobileLogin, /autoCapitalize="none"/);
    assert.match(mobileLogin, /writingDirection: "ltr"/);
    const webLogin = readFileSync(path.join(ROOT, "web/src/components/LoginScreen.tsx"), "utf8");
    assert.doesNotMatch(mobileLogin, /התחבר עם Microsoft/);
    assert.doesNotMatch(webLogin, /התחבר עם Microsoft/);
    assert.match(logo, /direction: "ltr"/);
    assert.match(mobileAuth, /resolveLoginEmail/);
    assert.match(appJson, /"host": "auth-callback"/);
    assert.doesNotMatch(appJson, /autoVerify/);
    const convexProvider = readFileSync(
      path.join(ROOT, "mobile/src/providers/ConvexAppProvider.tsx"),
      "utf8",
    );
    const metro = readFileSync(path.join(ROOT, "mobile/metro.config.js"), "utf8");
    const rootPkg = readFileSync(path.join(ROOT, "package.json"), "utf8");
    const mobilePkg = readFileSync(path.join(ROOT, "mobile/package.json"), "utf8");
    assert.match(convexProvider, /ConvexProviderWithAuth/);
    assert.match(metro, /disableHierarchicalLookup: true/);
    assert.match(metro, /extraNodeModules/);
    assert.match(metro, /nodeModulesPaths: \[mobileModules\]/);
    assert.match(rootPkg, /"convex": "1\.41\.0"/);
    assert.match(mobilePkg, /"overrides"/);
    assert.match(mobilePkg, /"convex": "1\.41\.0"/);
    assert.doesNotMatch(workflow, /echo "\$ANDROID_KEYSTORE_PASSWORD"/);
    assert.doesNotMatch(workflow, /echo "\$ANDROID_KEY_PASSWORD"/);
    assert.doesNotMatch(ci, /assembleRelease/);
    assert.doesNotMatch(deploy, /BabiTk\.apk/);
    for (const name of [
      "ANDROID_KEYSTORE_BASE64",
      "ANDROID_KEYSTORE_PASSWORD",
      "ANDROID_KEY_ALIAS",
      "ANDROID_KEY_PASSWORD",
    ]) {
      assert.match(signing, new RegExp(name));
    }
    const short = listing.split("## תיאור מלא")[0]?.split("## תיאור קצר")[1]?.trim() ?? "";
    assert.ok(short.length > 0 && short.length <= 80, `short description length ${short.length}`);
    assert.match(listing, /icon-512\.png/);
    assert.match(listing, /feature-graphic-1024x500\.png/);
  });
});
