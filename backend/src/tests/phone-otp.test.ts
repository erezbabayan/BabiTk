import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import {
  PHONE_OTP_MAX_ATTEMPTS,
  PHONE_OTP_MAX_SENDS_PER_HOUR,
  PHONE_OTP_TTL_MS,
  PHONE_OTP_WINDOW_MS,
  captureAllowedForPhone,
  hashPhoneOtp,
  judgeOtpVerify,
  phoneOtpMessage,
  planOtpSend,
  pruneOtpSends,
  randomSixDigitCode,
} from "../lib/phone-otp.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");

describe("phone otp rules", () => {
  it("stores a hash, never the code, and expires in 10 minutes", async () => {
    const code = "123456";
    const hash = await hashPhoneOtp(code);
    assert.equal(hash.length, 64);
    assert.equal(hash.includes(code), false);
    assert.equal(await hashPhoneOtp(code), hash);
    assert.notEqual(await hashPhoneOtp("123457"), hash);
    const now = Date.parse("2026-10-21T12:00:00.000Z");
    const plan = planOtpSend([], now);
    assert.equal(plan.ok, true);
    if (!plan.ok) return;
    assert.equal(Date.parse(plan.expiresAt) - now, PHONE_OTP_TTL_MS);
    assert.match(phoneOtpMessage(code), new RegExp(code));
    assert.equal(phoneOtpMessage(code).includes(hash), false);
  });

  it("allows 3 sends per hour and a new one after the window", () => {
    const now = Date.parse("2026-10-21T12:00:00.000Z");
    const recent = [0, 1, 2].map((minutes) => new Date(now - minutes * 60_000).toISOString());
    const blocked = planOtpSend(recent, now);
    assert.deepEqual(blocked, { ok: false, error: "rate_limited" });
    assert.equal(recent.length, PHONE_OTP_MAX_SENDS_PER_HOUR);
    const aged = [new Date(now - PHONE_OTP_WINDOW_MS).toISOString(), ...recent.slice(0, 2)];
    const open = planOtpSend(aged, now);
    assert.equal(open.ok, true);
    if (!open.ok) return;
    assert.equal(open.sentAt.length, 3);
    assert.deepEqual(pruneOtpSends(aged, now), recent.slice(0, 2));
  });

  it("accepts the right code once and stops after 5 wrong tries", async () => {
    const now = Date.parse("2026-10-21T12:00:00.000Z");
    const hash = await hashPhoneOtp("654321");
    const base = {
      pending: "+972501234567",
      hash,
      expiresAt: new Date(now + 60_000).toISOString(),
      code: "654321",
      nowMs: now,
    };
    assert.deepEqual(await judgeOtpVerify({ ...base, attempts: 4 }), { ok: true });
    const wrong = await judgeOtpVerify({ ...base, code: "000000", attempts: 0 });
    assert.deepEqual(wrong, { ok: false, error: "mismatch", attempts: 1 });
    const last = await judgeOtpVerify({
      ...base,
      code: "000000",
      attempts: PHONE_OTP_MAX_ATTEMPTS - 1,
    });
    assert.deepEqual(last, { ok: false, error: "too_many", attempts: PHONE_OTP_MAX_ATTEMPTS });
    const locked = await judgeOtpVerify({ ...base, attempts: PHONE_OTP_MAX_ATTEMPTS });
    assert.equal(locked.ok, false);
    if (locked.ok) return;
    assert.equal(locked.error, "too_many");
    assert.equal(locked.attempts, PHONE_OTP_MAX_ATTEMPTS);
    const malformed = await judgeOtpVerify({ ...base, code: "12", attempts: 1 });
    assert.deepEqual(malformed, { ok: false, error: "invalid_code", attempts: 1 });
    const expired = await judgeOtpVerify({
      ...base,
      expiresAt: new Date(now - 1).toISOString(),
      attempts: 1,
    });
    assert.deepEqual(expired, { ok: false, error: "expired", attempts: 1 });
    const missing = await judgeOtpVerify({ ...base, hash: null, attempts: 0 });
    assert.deepEqual(missing, { ok: false, error: "missing", attempts: 0 });
  });

  it("draws a 6-digit code", () => {
    for (let index = 0; index < 20; index += 1) {
      assert.match(randomSixDigitCode(), /^\d{6}$/);
    }
  });

  it("ignores task capture until the phone is verified", () => {
    assert.equal(captureAllowedForPhone(true), true);
    assert.equal(captureAllowedForPhone(false), false);
    assert.equal(captureAllowedForPhone(null), false);
    assert.equal(captureAllowedForPhone(undefined), false);
  });

  it("keeps the shared otp file identical", () => {
    const backend = readFileSync(path.join(root, "backend/src/lib/phone-otp.ts"), "utf8");
    const edge = readFileSync(path.join(root, "supabase/functions/_shared/phone-otp.ts"), "utf8");
    const convex = readFileSync(path.join(root, "convex/lib/phone_otp.ts"), "utf8");
    assert.equal(edge, backend);
    assert.equal(convex, backend);
  });

  it("grandfather existing linked phones and blocks self-verify", () => {
    const sql = readFileSync(
      path.join(root, "supabase/migrations/20261021180000_phone_otp.sql"),
      "utf8",
    );
    assert.match(sql, /phone_verify_attempts/);
    assert.match(sql, /phone_verify_sent_at/);
    assert.match(sql, /set phone_verified = true/);
    assert.match(sql, /phone is not null/);
    assert.match(sql, /service_role/);
  });

  it("sends the code only through Green-API and skips unverified webhook capture", () => {
    const service = readFileSync(path.join(root, "backend/src/services/phone.service.ts"), "utf8");
    assert.match(service, /sendWhatsAppOutbound/);
    assert.equal(service.includes("sendWhatsAppText"), false);
    assert.equal(service.includes("graph.facebook.com"), false);
    const webhook = readFileSync(
      path.join(root, "supabase/functions/whatsapp-green-webhook/index.ts"),
      "utf8",
    );
    const skip = webhook.indexOf('reason: "phone_not_verified"');
    const gate = webhook.indexOf("const gate = await gateCapture");
    assert.ok(skip > 0);
    assert.ok(gate > skip);
    const connect = readFileSync(
      path.join(root, "supabase/functions/whatsapp-green-connect/index.ts"),
      "utf8",
    );
    assert.equal(/phone_verified\s*=\s*true/.test(connect), false);
    const web = readFileSync(
      path.join(root, "web/src/components/SupabasePhoneLinkSettings.tsx"),
      "utf8",
    );
    assert.equal(web.includes("phone_verified: true"), false);
    assert.match(web, /שלחו קוד/);
    const mobile = readFileSync(path.join(root, "mobile/src/components/PhoneLinkScreen.tsx"), "utf8");
    assert.match(mobile, /אשרו את המספר/);
    assert.equal(mobile.includes("linkVerifiedPhone"), false);
  });
});
