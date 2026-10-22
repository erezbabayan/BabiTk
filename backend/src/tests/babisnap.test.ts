import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  BABISNAP_COPY,
  BABISNAP_DOWNLOAD_URL,
  BABISNAP_VOICE_INGEST_URL,
  babisnapAndroidIntentLink,
  babisnapDownloadUrl,
  babisnapOpenLink,
  babisnapPairLink,
  babisnapPairPageUrl,
  babisnapStatusLabel,
  isAndroidChrome,
  isBabisnapPairLocation,
  parseBabisnapResponse,
  readBabisnapPairFragment,
} from "../../../convex/lib/babisnap.ts";
import { hashDeviceToken } from "../../../supabase/functions/_shared/device-voice-ingest.ts";
import {
  performBabisnapAction,
  type BabisnapStore,
  type DeviceTokenRow,
} from "../../../supabase/functions/_shared/babisnap.ts";

function memoryStore(seed: DeviceTokenRow[] = []): BabisnapStore & { rows: DeviceTokenRow[] } {
  const rows = seed.map((row) => ({ ...row }));
  return {
    rows,
    async tokensForUser(userId) {
      return rows.filter((row) => row.userId === userId).map((row) => ({ ...row }));
    },
    async replaceBabisnap(userId, tokenHash) {
      const revokedAt = new Date().toISOString();
      for (const row of rows) {
        if (row.userId === userId && row.name === "BabiSnap" && row.revokedAt == null) {
          row.revokedAt = revokedAt;
        }
      }
      rows.push({
        userId,
        name: "BabiSnap",
        tokenHash,
        lastUsedAt: null,
        revokedAt: null,
      });
    },
    async disconnectBabisnap(userId) {
      const revokedAt = new Date().toISOString();
      for (const row of rows) {
        if (row.userId === userId && row.name === "BabiSnap" && row.revokedAt == null) {
          row.revokedAt = revokedAt;
        }
      }
    },
  };
}

describe("BabiSnap link", () => {
  it("uses the fixed download URL and the fixed voice-ingest endpoint", () => {
    assert.equal(
      BABISNAP_DOWNLOAD_URL,
      "https://github.com/erezbabayan/BabiSnap/releases/latest/download/BabiSnap.apk",
    );
    assert.equal(babisnapDownloadUrl(), BABISNAP_DOWNLOAD_URL);
    assert.equal(babisnapDownloadUrl("  "), null);
    assert.equal(babisnapDownloadUrl("http://example.test/app.apk"), null);
    assert.equal(
      BABISNAP_VOICE_INGEST_URL,
      "https://ghibfuinantybqidwadj.supabase.co/functions/v1/voice-ingest",
    );
    assert.equal(babisnapPairLink("   "), null);

    const link = babisnapPairLink("tok+en");
    assert.ok(link);
    const url = new URL(link);
    assert.equal(url.protocol, "babisnap:");
    assert.equal(url.hostname, "pair");
    assert.equal(url.searchParams.get("token"), "tok+en");
    assert.equal(url.searchParams.get("url"), BABISNAP_VOICE_INGEST_URL);
    assert.match(
      link,
      /url=https%3A%2F%2Fghibfuinantybqidwadj\.supabase\.co%2Ffunctions%2Fv1%2Fvoice-ingest$/,
    );
    assert.equal(
      babisnapAndroidIntentLink("tok+en"),
      "intent://pair?token=tok%2Ben&url=https%3A%2F%2Fghibfuinantybqidwadj.supabase.co%2Ffunctions%2Fv1%2Fvoice-ingest#Intent;scheme=babisnap;package=com.babisnap.app;S.browser_fallback_url=https%3A%2F%2Fgithub.com%2Ferezbabayan%2FBabiSnap%2Freleases%2Flatest%2Fdownload%2FBabiSnap.apk;end",
    );
    const androidChrome =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    assert.equal(isAndroidChrome(androidChrome), true);
    assert.equal(babisnapOpenLink("tok+en", androidChrome), babisnapAndroidIntentLink("tok+en"));
    assert.equal(babisnapOpenLink("tok+en", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), link);
    assert.equal(
      isAndroidChrome(
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/120.0.0.0 Mobile Safari/537.36",
      ),
      false,
    );
    assert.equal(babisnapStatusLabel({ connected: true, lastUsedAt: "2026-10-22T12:00:00Z" }), "מחובר ✓");
    assert.equal(babisnapStatusLabel({ connected: true, lastUsedAt: null }), "ממתין לחיבור");
    assert.equal(babisnapStatusLabel({ connected: false, lastUsedAt: null }), null);
    assert.equal(BABISNAP_COPY.connect, "חבר את BabiSnap");
    assert.equal(BABISNAP_COPY.openApp, "פתח ב-BabiSnap");
    assert.equal(BABISNAP_COPY.copyManual, "העתק קוד ידנית");
    assert.equal(BABISNAP_COPY.download, "הורד והתקן את BabiSnap");

    const page = babisnapPairPageUrl("tok+en secret");
    assert.ok(page);
    const parsed = new URL(page);
    assert.equal(parsed.origin + parsed.pathname, "https://erezbabayan.github.io/BabiTk/");
    assert.equal(parsed.search, "");
    assert.equal(parsed.hash.includes("tok+en"), false);
    assert.equal(parsed.hash.includes(" "), false);
    assert.match(parsed.hash, /#\/babisnap-pair#token=tok%2Ben%20secret&url=/);
    assert.equal(isBabisnapPairLocation(parsed.hash), true);
    const fragment = readBabisnapPairFragment(parsed.hash);
    assert.equal(fragment?.token, "tok+en secret");
    assert.equal(fragment?.url, BABISNAP_VOICE_INGEST_URL);
    assert.equal(
      readBabisnapPairFragment(
        `#/babisnap-pair#token=abc&url=${encodeURIComponent("https://evil.example/ingest")}`,
      ),
      null,
    );

    const root = path.resolve(import.meta.dirname, "../../..");
    const web = readFileSync(path.join(root, "web/src/components/BabiSnapSettings.tsx"), "utf8");
    const mobile = readFileSync(path.join(root, "mobile/src/components/BabiSnapSettings.tsx"), "utf8");
    assert.match(web, /window\.open\("about:blank"/);
    assert.match(web, /babisnapOpenLink/);
    assert.match(web, /babisnapPairPageUrl/);
    assert.match(web, /babisnap-logo\.webp/);
    const pairPage = readFileSync(path.join(root, "web/src/components/BabiSnapPairPage.tsx"), "utf8");
    const entry = readFileSync(path.join(root, "web/src/main.tsx"), "utf8");
    assert.match(pairPage, /BABISNAP_COPY\.openApp/);
    assert.match(pairPage, /babisnapOpenLink/);
    assert.doesNotMatch(pairPage, /localStorage|sessionStorage|fetch\(|console\./);
    const pairAt = entry.indexOf("isBabisnapPairLocation");
    const appAt = entry.indexOf("<App />");
    assert.ok(pairAt >= 0 && appAt > pairAt);
    assert.match(mobile, /babisnap-logo\.webp/);
    assert.match(mobile, /Linking\.openURL\(link\)/);
    assert.doesNotMatch(web, /פתח ב-BabiSnap/);
    assert.doesNotMatch(mobile, /פתח ב-BabiSnap/);
  });

  it("reads a connect response once and ignores a later status token", () => {
    const issued = parseBabisnapResponse({
      ok: true,
      connected: true,
      last_used_at: null,
      token: "babi_secret",
    });
    assert.equal(issued.token, "babi_secret");
    const later = parseBabisnapResponse({ ok: true, connected: true, last_used_at: "2026-10-22T12:00:00Z" });
    assert.equal(later.token, null);
    assert.equal(later.lastUsedAt, "2026-10-22T12:00:00Z");
    assert.throws(() => parseBabisnapResponse({ ok: false, error: "unauthorized" }), /unauthorized/);
  });
});

describe("BabiSnap tokens", () => {
  it("replaces only the caller's BabiSnap token and leaves Raspberry Pi alone", async () => {
    const store = memoryStore([
      {
        userId: "user-1",
        name: "Raspberry Pi",
        tokenHash: "a".repeat(64),
        lastUsedAt: "2026-10-01T00:00:00Z",
        revokedAt: null,
      },
      {
        userId: "user-1",
        name: "BabiSnap",
        tokenHash: "b".repeat(64),
        lastUsedAt: "2026-10-20T08:00:00Z",
        revokedAt: null,
      },
      {
        userId: "user-2",
        name: "BabiSnap",
        tokenHash: "c".repeat(64),
        lastUsedAt: null,
        revokedAt: null,
      },
    ]);

    const connected = await performBabisnapAction("connect", "user-1", store);
    assert.equal(connected.status, 200);
    const token = connected.body.token;
    assert.equal(typeof token, "string");
    assert.match(String(token), /^babi_/);
    assert.equal("token_hash" in connected.body, false);

    const hash = await hashDeviceToken(String(token));
    const mine = store.rows.filter((row) => row.userId === "user-1" && row.name === "BabiSnap");
    const active = mine.filter((row) => row.revokedAt == null);
    assert.equal(active.length, 1);
    assert.equal(active[0]?.tokenHash, hash);
    assert.notEqual(active[0]?.tokenHash, "b".repeat(64));
    assert.equal(mine.filter((row) => row.revokedAt != null).length, 1);

    const pi = store.rows.find((row) => row.name === "Raspberry Pi");
    assert.equal(pi?.revokedAt, null);
    assert.equal(pi?.tokenHash, "a".repeat(64));
    const other = store.rows.find((row) => row.userId === "user-2");
    assert.equal(other?.revokedAt, null);

    const status = await performBabisnapAction("status", "user-2", store);
    assert.equal(status.body.connected, true);
    assert.equal("token" in status.body, false);

    const disconnected = await performBabisnapAction("disconnect", "user-1", store);
    assert.equal(disconnected.body.connected, false);
    assert.equal(store.rows.find((row) => row.name === "Raspberry Pi")?.revokedAt, null);
    assert.equal(store.rows.find((row) => row.userId === "user-2")?.revokedAt, null);
    assert.equal(
      store.rows.filter((row) => row.userId === "user-1" && row.name === "BabiSnap" && row.revokedAt == null)
        .length,
      0,
    );
    assert.equal((await performBabisnapAction("nope", "user-1", store)).status, 400);
  });
});

describe("BabiSnap wiring", () => {
  it("keeps voice-ingest on bearer hashes and scopes the new function to the user JWT", () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const voice = readFileSync(path.join(root, "supabase/functions/voice-ingest/index.ts"), "utf8");
    const endpoint = readFileSync(path.join(root, "supabase/functions/babisnap/index.ts"), "utf8");
    const migration = readFileSync(
      path.join(root, "supabase/migrations/20261022160000_babisnap_device_tokens.sql"),
      "utf8",
    );
    const workflow = readFileSync(path.join(root, ".github/workflows/deploy-supabase-functions.yml"), "utf8");
    const config = readFileSync(path.join(root, "supabase/config.toml"), "utf8");

    assert.match(voice, /token_hash/);
    assert.doesNotMatch(voice, /babisnap_connect/);
    assert.match(endpoint, /auth\.getUser\(\)/);
    assert.match(endpoint, /babisnap_connect/);
    assert.match(endpoint, /babisnap_disconnect/);
    assert.match(endpoint, /babisnap_status/);
    assert.doesNotMatch(endpoint, /SERVICE_ROLE/);
    assert.match(config, /\[functions\.babisnap\]\s+verify_jwt = true/);
    assert.match(workflow, /functions deploy babisnap --project-ref "\$PROJECT_REF" --import-map "\$IMPORT_MAP"\n/);
    assert.match(migration, /name = 'BabiSnap'/);
    assert.match(migration, /user_id = auth\.uid\(\)/);
    assert.doesNotMatch(migration, /grant select \(token_hash\)/i);
    assert.match(migration, /grant update \(revoked_at\)/);
    assert.match(migration, /revoke all on function public\.babisnap_connect\(text\) from public, anon/);
  });
});
