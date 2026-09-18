import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BABITK_NATIVE_SOURCE,
  isNativeApp,
  parseNativeToWebMessage,
} from "./native-bridge.ts";

describe("parseNativeToWebMessage", () => {
  it("accepts a google session payload", () => {
    const parsed = parseNativeToWebMessage({
      source: BABITK_NATIVE_SOURCE,
      type: "googleSession",
      requestId: "abc",
      accessToken: "at",
      refreshToken: "rt",
    });
    assert.deepEqual(parsed, {
      type: "googleSession",
      requestId: "abc",
      accessToken: "at",
      refreshToken: "rt",
    });
  });

  it("rejects unknown messages", () => {
    assert.equal(parseNativeToWebMessage({ type: "ping" }), null);
    assert.equal(parseNativeToWebMessage("not-json"), null);
  });

  it("accepts an openItem payload", () => {
    const parsed = parseNativeToWebMessage({
      source: BABITK_NATIVE_SOURCE,
      type: "openItem",
      itemId: "item-1",
    });
    assert.deepEqual(parsed, { type: "openItem", itemId: "item-1" });
  });
});

describe("isNativeApp", () => {
  it("is false outside a WebView", () => {
    assert.equal(isNativeApp(), false);
  });
});

