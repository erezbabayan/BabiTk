/** Digits GREEN-API expects in getAuthorizationCode (no +, 00, or punctuation). */
export function phoneDigitsForGreenApi(phone: string): number {
  const digits = phone.trim().replace(/\D/g, "");
  if (digits.length < 9) {
    throw new Error("מספר טלפון לא תקין");
  }
  let international = digits;
  if (digits.startsWith("0") && digits.length === 10) {
    international = `972${digits.slice(1)}`;
  }
  const value = Number(international);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("מספר טלפון לא תקין");
  }
  return value;
}

export function parseAuthorizationCodeResponse(raw: unknown): {
  ok: boolean;
  code: string | null;
} {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: null };
  }
  const record = raw as { status?: unknown; code?: unknown };
  const code = typeof record.code === "string" ? record.code.trim() : "";
  const ok = record.status === true && code.length > 0;
  return { ok, code: ok ? code : null };
}

export function phoneFromWid(wid: string | null | undefined): string | null {
  if (!wid?.trim()) return null;
  const digits = wid.split("@")[0]?.split(":")[0]?.replace(/\D/g, "") ?? "";
  if (digits.length < 9) return null;
  return `+${digits}`;
}

export const WHATSAPP_WELCOME_MESSAGE =
  "BabiTk מחובר לוואטסאפ שלך. אפשר לשלוח הודעות לקבוצת הקליטה או «הודעה לעצמי» — והן ייכנסו ללוח.";

export const WHATSAPP_PAIRING_HINT =
  "בוואטסאפ: הגדרות → מכשירים מקושרים → קישור מכשיר → קישור עם מספר טלפון. הזינו את הקוד שמופיע כאן.";

export const WHATSAPP_SCAN_HINT =
  "בוואטסאפ בטלפון: הגדרות → מכשירים מקושרים → קישור מכשיר, וסרקו את ה-QR.";
