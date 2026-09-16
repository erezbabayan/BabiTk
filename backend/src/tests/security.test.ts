import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { env } from "../config/env.js";
import { secretEquals } from "../lib/secret-equals.js";
import { verifyAlternateWebhookAuth } from "../services/whatsapp/provider.js";
import {
  createGoogleOAuthState,
  parseGoogleOAuthState,
} from "../services/calendar.service.js";
import { verifyGreenApiWebhookAuth } from "../../../convex/lib/greenApiParser.js";

describe("secretEquals", () => {
  it("accepts matching secrets", () => {
    assert.equal(secretEquals("token-a", "token-a"), true);
  });

  it("rejects missing expected token", () => {
    assert.equal(secretEquals("token-a", undefined), false);
    assert.equal(secretEquals("token-a", ""), false);
  });

  it("rejects mismatched secrets", () => {
    assert.equal(secretEquals("token-a", "token-b"), false);
  });
});

describe("webhook auth fail-closed", () => {
  it("rejects Green-API webhooks when no token is configured", () => {
    const request = new Request("https://example.com/webhook/green-api", {
      headers: { Authorization: "Bearer anything" },
    });
    assert.equal(verifyGreenApiWebhookAuth(request, undefined), false);
  });

  it("rejects Green-API webhooks with the wrong bearer token", () => {
    const request = new Request("https://example.com/webhook/green-api", {
      headers: { Authorization: "Bearer wrong" },
    });
    assert.equal(verifyGreenApiWebhookAuth(request, "secret-token"), false);
  });

  it("accepts Green-API webhooks with the matching bearer token", () => {
    const request = new Request("https://example.com/webhook/green-api", {
      headers: { Authorization: "Bearer secret-token" },
    });
    assert.equal(verifyGreenApiWebhookAuth(request, "secret-token"), true);
  });

  it("rejects alternate inbound webhooks when no token is configured", () => {
    assert.equal(verifyAlternateWebhookAuth({}, {}), false);
  });
});

describe("demo sync defaults", () => {
  it("stays off in production unless explicitly enabled", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousDemo = process.env.DEMO_SYNC_ENABLED;
    process.env.NODE_ENV = "production";
    delete process.env.DEMO_SYNC_ENABLED;
    try {
      assert.equal(env.demoSyncEnabled, false);
      assert.equal(env.demoSyncToken, "");
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousDemo === undefined) {
        delete process.env.DEMO_SYNC_ENABLED;
      } else {
        process.env.DEMO_SYNC_ENABLED = previousDemo;
      }
    }
  });
});

describe("Google OAuth state", () => {
  it("round-trips a signed user id and rejects tampering", () => {
    process.env.GOOGLE_CLIENT_SECRET = "test-oauth-secret";
    const state = createGoogleOAuthState("user-12345678");
    assert.equal(parseGoogleOAuthState(state), "user-12345678");
    assert.throws(() => parseGoogleOAuthState(`${state}x`), /invalid_oauth_state/);
    assert.throws(() => parseGoogleOAuthState("user-12345678"), /invalid_oauth_state/);
  });
});
