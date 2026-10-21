import { env } from "../config/env.js";
import { getSupabaseAdmin } from "../lib/supabase.js";
import {
  PHONE_OTP_ERRORS,
  hashPhoneOtp,
  judgeOtpVerify,
  phoneOtpMessage,
  planOtpSend,
  randomSixDigitCode,
} from "../lib/phone-otp.js";
import {
  getDemoUserProfile,
  linkDemoUserPhone,
  readDemoOtpState,
  writeDemoOtpState,
} from "./demo-user.service.js";
import { normalizePhone } from "./items.service.js";
import { sendWhatsAppOutbound } from "./whatsapp/outbound.js";

const OTP_COLUMNS =
  "phone_pending, phone_verify_hash, phone_verify_expires_at, phone_verify_attempts, phone_verify_sent_at, whatsapp_capture_group_chat_id, whatsapp_capture_group_name";

export interface UserProfile {
  id: string;
  email: string;
  phone: string | null;
  phone_verified: boolean;
  phone_pending: string | null;
}

function asSentAt(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function personalChatPatch(
  phone: string,
  currentChatId: string | null | undefined,
  currentName: string | null | undefined,
): Record<string, string> {
  if (currentChatId?.trim()) return {};
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return {};
  return {
    whatsapp_capture_group_chat_id: `${digits}@c.us`,
    whatsapp_capture_group_name: currentName?.trim() || "הודעה לעצמי (BabiTk)",
  };
}

async function deliverOtp(userId: string, phone: string, body: string): Promise<void> {
  if (env.isSupabaseConfigured) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("whatsapp_gateways")
      .select("instance_id, api_token, api_url")
      .eq("user_id", userId)
      .maybeSingle();
    const instanceId = typeof data?.instance_id === "string" ? data.instance_id.trim() : "";
    const token = typeof data?.api_token === "string" ? data.api_token.trim() : "";
    if (instanceId && token) {
      await sendWhatsAppOutbound(
        { to: phone, body },
        {
          instanceId,
          token,
          baseUrl: typeof data?.api_url === "string" ? data.api_url : undefined,
        },
      );
      return;
    }
  }
  if (env.greenApiInstanceId && env.greenApiToken) {
    await sendWhatsAppOutbound({ to: phone, body });
    return;
  }
  throw new Error(PHONE_OTP_ERRORS.no_gateway);
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  if (!env.isSupabaseConfigured) {
    const profile = await getDemoUserProfile();
    if (profile.id !== userId) {
      throw new Error(`User profile not found: ${userId}`);
    }
    return profile;
  }

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

async function assertPhoneAvailable(userId: string, phone: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const digits = phone.replace(/\D/g, "");
  const variants = [...new Set([phone, `+${digits}`, digits])];
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .in("phone", variants)
    .neq("id", userId)
    .limit(1);
  if (error) {
    throw new Error(`Failed to check phone: ${error.message}`);
  }
  if (data && data.length > 0) {
    throw new Error(PHONE_OTP_ERRORS.taken);
  }
}

export async function requestPhoneVerification(
  userId: string,
  rawPhone: string,
): Promise<{ message: string; devCode?: string }> {
  const phone = normalizePhone(rawPhone);
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) {
    throw new Error(PHONE_OTP_ERRORS.invalid_phone);
  }

  const now = Date.now();
  const code = randomSixDigitCode();
  const hash = await hashPhoneOtp(code);
  const messageBody = phoneOtpMessage(code);

  if (!env.isSupabaseConfigured) {
    const profile = await getDemoUserProfile();
    if (profile.id !== userId) {
      throw new Error("משתמש לא נמצא");
    }
    if (profile.phone_verified && profile.phone === phone) {
      return { message: PHONE_OTP_ERRORS.already };
    }
    const state = await readDemoOtpState();
    const plan = planOtpSend(state.sentAt, now);
    if (!plan.ok) throw new Error(PHONE_OTP_ERRORS.rate_limited);
    await writeDemoOtpState({
      pending: phone,
      hash,
      expiresAt: plan.expiresAt,
      attempts: 0,
      sentAt: plan.sentAt,
    });
    try {
      await deliverOtp(userId, phone, messageBody);
      return { message: "נשלח קוד אימות בוואטסאפ. הקוד תקף ל-10 דקות." };
    } catch (error) {
      if (env.isDevelopment) {
        return {
          message: "WhatsApp לא מוגדר — קוד פיתוח (רק בסביבת dev)",
          devCode: code,
        };
      }
      await writeDemoOtpState(state);
      throw error instanceof Error && error.message === PHONE_OTP_ERRORS.no_gateway
        ? error
        : new Error(PHONE_OTP_ERRORS.send_failed);
    }
  }

  const supabase = getSupabaseAdmin();
  const current = await getUserProfile(userId);
  if (current.phone_verified && current.phone === phone) {
    return { message: PHONE_OTP_ERRORS.already };
  }
  await assertPhoneAvailable(userId, phone);

  const { data: otpRow, error: otpError } = await supabase
    .from("users")
    .select(OTP_COLUMNS)
    .eq("id", userId)
    .single();
  if (otpError || !otpRow) {
    throw new Error("יש להחיל את מיגרציית אימות הטלפון לפני שליחת קוד.");
  }

  const previous = {
    phone_pending: otpRow.phone_pending as string | null,
    phone_verify_hash: otpRow.phone_verify_hash as string | null,
    phone_verify_expires_at: otpRow.phone_verify_expires_at as string | null,
    phone_verify_attempts: Number(otpRow.phone_verify_attempts ?? 0),
    phone_verify_sent_at: asSentAt(otpRow.phone_verify_sent_at),
  };
  const plan = planOtpSend(previous.phone_verify_sent_at, now);
  if (!plan.ok) throw new Error(PHONE_OTP_ERRORS.rate_limited);

  const nextChallenge = {
    phone_pending: phone,
    phone_verify_hash: hash,
    phone_verify_expires_at: plan.expiresAt,
    phone_verify_attempts: 0,
    phone_verify_sent_at: plan.sentAt,
    updated_at: new Date(now).toISOString(),
  };
  const { error: saveError } = await supabase.from("users").update(nextChallenge).eq("id", userId);
  if (saveError) {
    throw new Error(`Failed to save verification: ${saveError.message}`);
  }

  try {
    await deliverOtp(userId, phone, messageBody);
  } catch (error) {
    await supabase
      .from("users")
      .update({ ...previous, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error instanceof Error && error.message === PHONE_OTP_ERRORS.no_gateway) throw error;
    throw new Error(PHONE_OTP_ERRORS.send_failed);
  }

  return { message: "נשלח קוד אימות בוואטסאפ. הקוד תקף ל-10 דקות." };
}

export async function verifyPhoneCode(userId: string, code: string): Promise<UserProfile> {
  const now = Date.now();

  if (!env.isSupabaseConfigured) {
    const profile = await getDemoUserProfile();
    if (profile.id !== userId) throw new Error("משתמש לא נמצא");
    const state = await readDemoOtpState();
    const verdict = await judgeOtpVerify({
      pending: state.pending,
      hash: state.hash,
      expiresAt: state.expiresAt,
      attempts: state.attempts,
      code,
      nowMs: now,
    });
    if (!verdict.ok) {
      if (verdict.error === "mismatch" || verdict.error === "too_many") {
        await writeDemoOtpState({ ...state, attempts: verdict.attempts });
      }
      throw new Error(PHONE_OTP_ERRORS[verdict.error]);
    }
    return linkDemoUserPhone(state.pending!);
  }

  const supabase = getSupabaseAdmin();
  const { data: user, error } = await supabase
    .from("users")
    .select(OTP_COLUMNS)
    .eq("id", userId)
    .single();
  if (error || !user) {
    throw new Error("יש להחיל את מיגרציית אימות הטלפון לפני אימות הקוד.");
  }

  const verdict = await judgeOtpVerify({
    pending: (user.phone_pending as string | null) ?? null,
    hash: (user.phone_verify_hash as string | null) ?? null,
    expiresAt: (user.phone_verify_expires_at as string | null) ?? null,
    attempts: Number(user.phone_verify_attempts ?? 0),
    code,
    nowMs: now,
  });
  if (!verdict.ok) {
    if (verdict.error === "mismatch" || verdict.error === "too_many") {
      await supabase
        .from("users")
        .update({
          phone_verify_attempts: verdict.attempts,
          updated_at: new Date(now).toISOString(),
        })
        .eq("id", userId);
    }
    throw new Error(PHONE_OTP_ERRORS[verdict.error]);
  }

  const phone = user.phone_pending as string;
  await assertPhoneAvailable(userId, phone);
  const { error: updateError } = await supabase
    .from("users")
    .update({
      phone,
      phone_verified: true,
      phone_pending: null,
      phone_verify_hash: null,
      phone_verify_expires_at: null,
      phone_verify_attempts: 0,
      updated_at: new Date(now).toISOString(),
      ...personalChatPatch(
        phone,
        user.whatsapp_capture_group_chat_id as string | null,
        user.whatsapp_capture_group_name as string | null,
      ),
    })
    .eq("id", userId);
  if (updateError) {
    throw new Error(`Failed to verify phone: ${updateError.message}`);
  }
  return getUserProfile(userId);
}
