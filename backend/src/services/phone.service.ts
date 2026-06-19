import { createHash, randomInt } from "node:crypto";
import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import { normalizePhone } from "./items.service.js";
import { sendWhatsAppText } from "./whatsapp/send.js";

const CODE_TTL_MS = 10 * 60 * 1000;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return String(randomInt(100_000, 999_999));
}

export interface UserProfile {
  id: string;
  email: string;
  phone: string | null;
  phone_verified: boolean;
  phone_pending: string | null;
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, phone, phone_verified, phone_pending")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error(`User profile not found: ${error?.message ?? userId}`);
  }

  return data as UserProfile;
}

export async function requestPhoneVerification(
  userId: string,
  rawPhone: string,
): Promise<{ message: string; devCode?: string }> {
  const phone = normalizePhone(rawPhone);
  const supabase = getSupabaseAdmin();

  const { data: taken } = await supabase
    .from("users")
    .select("id")
    .eq("phone", phone)
    .neq("id", userId)
    .maybeSingle();

  if (taken) {
    throw new Error("מספר הטלפון כבר מקושר לחשבון אחר");
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const { error } = await supabase
    .from("users")
    .update({
      phone_pending: phone,
      phone_verify_hash: hashCode(code),
      phone_verify_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    throw new Error(`Failed to save verification: ${error.message}`);
  }

  const message = `קוד האימות שלך ב-MindTasker: ${code}\nהקוד תקף ל-10 דקות.`;

  try {
    await sendWhatsAppText(phone, message);
    return { message: "נשלח קוד אימות בוואטסאפ" };
  } catch {
    if (env.isDevelopment) {
      return {
        message: "WhatsApp לא מוגדר — קוד פיתוח (רק בסביבת dev)",
        devCode: code,
      };
    }
    throw new Error("שליחת קוד בוואטסאפ נכשלה. ודא ש-WhatsApp API מוגדר.");
  }
}

export async function verifyPhoneCode(userId: string, code: string): Promise<UserProfile> {
  const supabase = getSupabaseAdmin();
  const { data: user, error } = await supabase
    .from("users")
    .select("phone_pending, phone_verify_hash, phone_verify_expires_at")
    .eq("id", userId)
    .single();

  if (error || !user?.phone_pending || !user.phone_verify_hash) {
    throw new Error("אין בקשת אימות פעילה. בקש קוד חדש.");
  }

  if (
    user.phone_verify_expires_at &&
    new Date(user.phone_verify_expires_at).getTime() < Date.now()
  ) {
    throw new Error("קוד האימות פג תוקף. בקש קוד חדש.");
  }

  if (hashCode(code.trim()) !== user.phone_verify_hash) {
    throw new Error("קוד שגוי");
  }

  const { error: updateError } = await supabase
    .from("users")
    .update({
      phone: user.phone_pending,
      phone_verified: true,
      phone_pending: null,
      phone_verify_hash: null,
      phone_verify_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updateError) {
    throw new Error(`Failed to verify phone: ${updateError.message}`);
  }

  return getUserProfile(userId);
}
