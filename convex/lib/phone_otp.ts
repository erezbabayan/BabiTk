/** Phone OTP rules shared by the API, the Supabase edge function, and Convex. */

export const PHONE_OTP_TTL_MS = 10 * 60 * 1000;
export const PHONE_OTP_MAX_ATTEMPTS = 5;
export const PHONE_OTP_MAX_SENDS_PER_HOUR = 3;
export const PHONE_OTP_WINDOW_MS = 60 * 60 * 1000;

export const PHONE_OTP_ERRORS = {
  rate_limited: "אפשר לשלוח עד 3 קודים בשעה. נסו שוב מאוחר יותר.",
  missing: "אין בקשת אימות פעילה. בקשו קוד חדש.",
  expired: "קוד האימות פג תוקף. בקשו קוד חדש.",
  too_many: "יותר מדי ניסיונות. בקשו קוד חדש.",
  mismatch: "קוד שגוי.",
  taken: "מספר הטלפון כבר מקושר לחשבון אחר",
  no_gateway: "חברו קודם את וואטסאפ כדי לקבל את הקוד במספר.",
  send_failed: "שליחת הקוד בוואטסאפ נכשלה.",
  invalid_phone: "מספר טלפון לא תקין",
  invalid_code: "הקוד חייב להיות 6 ספרות.",
  already: "המספר כבר מאומת",
} as const;

export type PhoneOtpErrorCode = keyof typeof PHONE_OTP_ERRORS;

export function phoneOtpMessage(code: string): string {
  return `קוד האימות שלך ב-BabiTk: ${code}\nהקוד תקף ל-10 דקות. אל תשתפו אותו.`;
}

/** Task capture is allowed only for a phone that already passed OTP. */
export function captureAllowedForPhone(phoneVerified: boolean | null | undefined): boolean {
  return phoneVerified === true;
}

export function pruneOtpSends(sentAt: readonly string[], nowMs: number): string[] {
  return sentAt.filter((iso) => {
    const sent = Date.parse(iso);
    return Number.isFinite(sent) && nowMs - sent < PHONE_OTP_WINDOW_MS;
  });
}

export type OtpSendPlan =
  | { ok: true; expiresAt: string; sentAt: string[] }
  | { ok: false; error: "rate_limited" };

export function planOtpSend(sentAt: readonly string[], nowMs: number): OtpSendPlan {
  const fresh = pruneOtpSends(sentAt, nowMs);
  if (fresh.length >= PHONE_OTP_MAX_SENDS_PER_HOUR) {
    return { ok: false, error: "rate_limited" };
  }
  return {
    ok: true,
    expiresAt: new Date(nowMs + PHONE_OTP_TTL_MS).toISOString(),
    sentAt: [...fresh, new Date(nowMs).toISOString()],
  };
}

export function randomSixDigitCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100_000 + (buf[0]! % 900_000));
}

export async function hashPhoneOtp(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code.trim());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export type OtpVerifyInput = {
  pending: string | null;
  hash: string | null;
  expiresAt: string | null;
  attempts: number;
  code: string;
  nowMs: number;
};

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; error: "missing" | "expired" | "too_many" | "mismatch" | "invalid_code"; attempts: number };

export async function judgeOtpVerify(input: OtpVerifyInput): Promise<OtpVerifyResult> {
  const attempts = Number.isFinite(input.attempts) ? input.attempts : 0;
  if (!input.pending || !input.hash) {
    return { ok: false, error: "missing", attempts };
  }
  if (attempts >= PHONE_OTP_MAX_ATTEMPTS) {
    return { ok: false, error: "too_many", attempts };
  }
  if (!/^\d{6}$/.test(input.code.trim())) {
    return { ok: false, error: "invalid_code", attempts };
  }
  const expires = input.expiresAt ? Date.parse(input.expiresAt) : Number.NaN;
  if (!Number.isFinite(expires) || expires <= input.nowMs) {
    return { ok: false, error: "expired", attempts };
  }
  const presented = await hashPhoneOtp(input.code);
  if (!timingSafeEqualHex(presented, input.hash)) {
    const next = attempts + 1;
    if (next >= PHONE_OTP_MAX_ATTEMPTS) {
      return { ok: false, error: "too_many", attempts: next };
    }
    return { ok: false, error: "mismatch", attempts: next };
  }
  return { ok: true };
}
