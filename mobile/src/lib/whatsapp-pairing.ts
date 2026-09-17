/** Digits GREEN-API expects in getAuthorizationCode (no +, 00, or punctuation). */
export function phoneDigitsForGreenApi(phone: string): number {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
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

export function formatPairingCode(code: string): string {
  const compact = code.replace(/\s+/g, "").toUpperCase();
  if (compact.length === 8) {
    return `${compact.slice(0, 4)} ${compact.slice(4)}`;
  }
  return compact;
}

export const WHATSAPP_PAIRING_HINT =
  "בוואטסאפ: הגדרות → מכשירים מקושרים → קישור מכשיר → קישור עם מספר טלפון";

export const WHATSAPP_SCAN_HINT =
  "בוואטסאפ בטלפון אחר: הגדרות → מכשירים מקושרים → קישור מכשיר, וסרקו את ה-QR";
