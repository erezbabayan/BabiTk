import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import {
  assertOtpRequestAllowed,
  assertOtpVerifyAllowed,
  clearOtpVerifyFailures,
  recordOtpVerifyFailure,
} from "../lib/otp-rate-limit.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import {
  getDemoUserProfile,
  linkDemoUserPhone,
  setDemoUserPhonePending,
} from "./demo-user.service.js";
import { normalizePhone } from "./items.service.js";
import { sendWhatsAppText } from "./whatsapp/send.js";
const CODE_TTL_MS = 10 * 60 * 1000;

function otpPepper(): string {
  const pepper =
    process.env.PHONE_OTP_PEPPER?.trim() ||
    env.supabaseServiceRoleKey ||
    (env.isDevelopment ? "dev-otp-pepper" : "");
  return pepper;
}

function hashCode(code: string): string {
  const pepper = otpPepper();
  if (!pepper) {
    throw new Error("אימות טלפון אינו מוגדר בשרת");
  }
  return createHmac("sha256", pepper).update(code).digest("hex");
}

function hashesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
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
  if (!env.isSupabaseConfigured) {
    const profile = await getDemoUserProfile();
    if (profile.id !== userId) {
      throw new Error(`User profile not found: ${userId}`);
    }
    return profile;
  }

  const supabase = getSupabaseAdmin();  const { data, error } = await supabase
    .from("users")
    .select("id, email, phone, phone_verified, phone_pending")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error("פרופיל המשתמש לא נמצא");
  }

  return data as UserProfile;
}

export async function requestPhoneVerification(
  userId: string,
  rawPhone: string,
): Promise<{ message: string; devCode?: string }> {
  const phone = normalizePhone(rawPhone);
  assertOtpRequestAllowed(`${userId}:${phone}`);

  if (!env.isSupabaseConfigured) {
    if (userId !== (await getDemoUserProfile()).id) {
      throw new Error("משתמש לא נמצא");
    }

    const code = generateCode();
    await setDemoUserPhonePending(phone);

    const message = `קוד האימות שלך ב-BabaiTk: ${code}\nהקוד תקף ל-10 דקות.`;

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
    throw new Error("שמירת קוד האימות נכשלה");
  }

  const message = `קוד האימות שלך ב-BabaiTk: ${code}\nהקוד תקף ל-10 דקות.`;

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
  assertOtpVerifyAllowed(userId);
  if (!env.isSupabaseConfigured) {
    const profile = await getDemoUserProfile();
    if (!profile.phone_pending) {
      throw new Error("אין בקשת אימות פעילה. בקש קוד חדש.");
    }

    if (env.isDevelopment && code.trim().length >= 4) {
      clearOtpVerifyFailures(userId);
      return await linkDemoUserPhone(profile.phone_pending);
    }

    recordOtpVerifyFailure(userId);
    throw new Error("קוד שגוי");
  }

  const supabase = getSupabaseAdmin();  const { data: user, error } = await supabase
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

  if (!hashesMatch(hashCode(code.trim()), user.phone_verify_hash)) {
    recordOtpVerifyFailure(userId);
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
    throw new Error("אימות הטלפון נכשל");
  }

  clearOtpVerifyFailures(userId);
  return getUserProfile(userId);
}
