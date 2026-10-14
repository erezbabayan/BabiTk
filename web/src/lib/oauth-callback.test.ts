import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { completePkceSignIn } from "./oauth-callback.ts";

describe("completePkceSignIn", () => {
  it("skips exchange when a session already exists", async () => {
    let exchanged = 0;
    const result = await completePkceSignIn({
      code: "abc",
      hasSession: true,
      exchange: async () => {
        exchanged += 1;
        return { error: null };
      },
    });
    assert.equal(exchanged, 0);
    assert.equal(result.exchanged, false);
    assert.equal(result.errorMessage, null);
  });

  it("exchanges a PKCE code once and ignores a second attempt", async () => {
    let exchanged = 0;
    let guard: string | null = null;
    const exchange = async () => {
      exchanged += 1;
      return { error: null };
    };
    const first = await completePkceSignIn({
      code: "pkce-1",
      hasSession: false,
      exchange,
      readGuard: () => guard,
      writeGuard: (code) => {
        guard = code;
      },
    });
    const second = await completePkceSignIn({
      code: "pkce-1",
      hasSession: false,
      exchange,
      readGuard: () => guard,
      writeGuard: (code) => {
        guard = code;
      },
    });
    assert.equal(first.exchanged, true);
    assert.equal(second.exchanged, false);
    assert.equal(exchanged, 1);
  });

  it("returns the exchange error message", async () => {
    const result = await completePkceSignIn({
      code: "bad",
      hasSession: false,
      exchange: async () => ({ error: { message: "invalid flow state" } }),
    });
    assert.equal(result.exchanged, false);
    assert.equal(result.errorMessage, "invalid flow state");
  });
});
