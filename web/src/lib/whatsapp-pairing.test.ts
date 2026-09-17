import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  formatPairingCode,
  parseAuthorizationCodeResponse,
  phoneDigitsForGreenApi,
  phoneFromWid,
} from "./whatsapp-pairing.ts";

describe("whatsapp pairing helpers", () => {
  it("converts Israeli local numbers to GREEN-API digits", () => {
    assert.equal(phoneDigitsForGreenApi("0501234567"), 972501234567);
    assert.equal(phoneDigitsForGreenApi("+97250-123-4567"), 972501234567);
    assert.equal(phoneDigitsForGreenApi("972501234567"), 972501234567);
  });

  it("rejects too-short numbers", () => {
    assert.throws(() => phoneDigitsForGreenApi("123"), /לא תקין/);
  });

  it("reads a successful pairing code payload", () => {
    assert.deepEqual(parseAuthorizationCodeResponse({ status: true, code: "GAPI2018" }), {
      ok: true,
      code: "GAPI2018",
    });
  });

  it("treats a failed pairing payload as empty", () => {
    assert.deepEqual(parseAuthorizationCodeResponse({ status: false, code: "" }), {
      ok: false,
      code: null,
    });
    assert.deepEqual(parseAuthorizationCodeResponse("oops"), { ok: false, code: null });
  });

  it("formats an 8-character pairing code for reading", () => {
    assert.equal(formatPairingCode("gapi2018"), "GAPI 2018");
    assert.equal(formatPairingCode("ABC"), "ABC");
  });

  it("reads a phone from a WhatsApp wid", () => {
    assert.equal(phoneFromWid("972501234567:12@c.us"), "+972501234567");
    assert.equal(phoneFromWid(""), null);
  });
});
