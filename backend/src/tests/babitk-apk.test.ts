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
    assert.match(download, /babitk-logo\.webp/);
    assert.match(download, /h-\[20px\] w-\[20px\]/);
    const labelAt = download.indexOf("{BABITK_APK_LABEL}");
    const logoAt = download.indexOf("<img");
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
    assert.match(workflow, /upload-artifact@v4/);
    assert.match(workflow, /name: BabiTk-aab/);
    assert.match(workflow, /ANDROID_KEYSTORE_BASE64/);
    assert.match(workflow, /ANDROID_KEYSTORE_PASSWORD/);
    assert.match(workflow, /ANDROID_KEY_ALIAS/);
    assert.match(workflow, /ANDROID_KEY_PASSWORD/);
    assert.match(workflow, /base64 -d > mobile\/android\/app\/babitk-release\.keystore/);
    assert.match(workflow, /ndk;\$\{ndk:-27\.1\.12297006\}/);
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
