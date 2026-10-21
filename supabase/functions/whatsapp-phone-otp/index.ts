import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2";

import { normalizePhone } from "../_shared/green-api.ts";
import {
  PHONE_OTP_ERRORS,
  hashPhoneOtp,
  judgeOtpVerify,
  phoneOtpMessage,
  planOtpSend,
  randomSixDigitCode,
} from "../_shared/phone-otp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEFAULT_GREEN_URL = "https://api.greenapi.com";

const OTP_COLUMNS =
  "phone, phone_verified, phone_pending, phone_verify_hash, phone_verify_expires_at, phone_verify_attempts, phone_verify_sent_at, whatsapp_capture_group_chat_id, whatsapp_capture_group_name";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
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

async function sendViaGreenApi(
  gateway: { instance_id: string; api_token: string; api_url: string | null },
  phone: string,
  message: string,
): Promise<void> {
  const base = (gateway.api_url || DEFAULT_GREEN_URL).replace(/\/$/, "");
  const digits = phone.replace(/\D/g, "");
  const response = await fetch(
    `${base}/waInstance${gateway.instance_id}/sendMessage/${gateway.api_token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId: `${digits}@c.us`,
        message,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(PHONE_OTP_ERRORS.send_failed);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_ANON || !SERVICE_ROLE) {
    return json({ ok: false, message: "missing_supabase_env" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ ok: false, message: "יש להתחבר מחדש" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ ok: false, message: "יש להתחבר מחדש" }, 401);
  }
  const userId = userData.user.id;

  let action = "";
  let phone = "";
  let code = "";
  try {
    const body = (await req.json()) as { action?: string; phone?: string; code?: string };
    action = typeof body.action === "string" ? body.action.trim() : "";
    phone = typeof body.phone === "string" ? body.phone : "";
    code = typeof body.code === "string" ? body.code : "";
  } catch {
    return json({ ok: false, message: "בקשה לא תקינה" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (action === "request") {
    let normalized = "";
    try {
      normalized = normalizePhone(phone);
    } catch {
      return json({ ok: false, message: PHONE_OTP_ERRORS.invalid_phone }, 400);
    }
    const digits = normalized.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) {
      return json({ ok: false, message: PHONE_OTP_ERRORS.invalid_phone }, 400);
    }

    const { data: row, error } = await admin.from("users").select(OTP_COLUMNS).eq("id", userId).maybeSingle();
    if (error || !row) {
      return json(
        { ok: false, message: "יש להחיל את מיגרציית אימות הטלפון לפני שליחת קוד." },
        500,
      );
    }
    if (row.phone_verified === true && row.phone === normalized) {
      return json({ ok: true, message: PHONE_OTP_ERRORS.already, phone: normalized, alreadyVerified: true });
    }

    const variants = [...new Set([normalized, `+${digits}`, digits])];
    const { data: taken } = await admin
      .from("users")
      .select("id")
      .in("phone", variants)
      .neq("id", userId)
      .limit(1);
    if (taken && taken.length > 0) {
      return json({ ok: false, message: PHONE_OTP_ERRORS.taken }, 400);
    }

    const { data: gateway } = await admin
      .from("whatsapp_gateways")
      .select("instance_id, api_token, api_url")
      .eq("user_id", userId)
      .maybeSingle();
    const instanceId = typeof gateway?.instance_id === "string" ? gateway.instance_id.trim() : "";
    const token = typeof gateway?.api_token === "string" ? gateway.api_token.trim() : "";
    if (!instanceId || !token) {
      return json({ ok: false, message: PHONE_OTP_ERRORS.no_gateway }, 400);
    }

    const now = Date.now();
    const previousSent = asSentAt(row.phone_verify_sent_at);
    const plan = planOtpSend(previousSent, now);
    if (!plan.ok) {
      return json({ ok: false, message: PHONE_OTP_ERRORS.rate_limited }, 429);
    }
    const otp = randomSixDigitCode();
    const hash = await hashPhoneOtp(otp);
    const previous = {
      phone_pending: row.phone_pending,
      phone_verify_hash: row.phone_verify_hash,
      phone_verify_expires_at: row.phone_verify_expires_at,
      phone_verify_attempts: Number(row.phone_verify_attempts ?? 0),
      phone_verify_sent_at: previousSent,
    };
    const { error: saveError } = await admin
      .from("users")
      .update({
        phone_pending: normalized,
        phone_verify_hash: hash,
        phone_verify_expires_at: plan.expiresAt,
        phone_verify_attempts: 0,
        phone_verify_sent_at: plan.sentAt,
        updated_at: new Date(now).toISOString(),
      })
      .eq("id", userId);
    if (saveError) {
      return json({ ok: false, message: PHONE_OTP_ERRORS.send_failed }, 500);
    }
    try {
      await sendViaGreenApi(
        { instance_id: instanceId, api_token: token, api_url: gateway?.api_url ?? null },
        normalized,
        phoneOtpMessage(otp),
      );
    } catch {
      await admin.from("users").update({ ...previous, updated_at: new Date().toISOString() }).eq("id", userId);
      return json({ ok: false, message: PHONE_OTP_ERRORS.send_failed }, 502);
    }
    return json({
      ok: true,
      message: "נשלח קוד אימות בן 6 ספרות לוואטסאפ. הקוד תקף ל-10 דקות.",
      phone: normalized,
    });
  }

  if (action === "verify") {
    const { data: row, error } = await admin.from("users").select(OTP_COLUMNS).eq("id", userId).maybeSingle();
    if (error || !row) {
      return json(
        { ok: false, message: "יש להחיל את מיגרציית אימות הטלפון לפני אימות הקוד." },
        500,
      );
    }
    const verdict = await judgeOtpVerify({
      pending: typeof row.phone_pending === "string" ? row.phone_pending : null,
      hash: typeof row.phone_verify_hash === "string" ? row.phone_verify_hash : null,
      expiresAt: typeof row.phone_verify_expires_at === "string" ? row.phone_verify_expires_at : null,
      attempts: Number(row.phone_verify_attempts ?? 0),
      code,
      nowMs: Date.now(),
    });
    if (!verdict.ok) {
      if (verdict.error === "mismatch" || verdict.error === "too_many") {
        await admin
          .from("users")
          .update({
            phone_verify_attempts: verdict.attempts,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
      }
      const status = verdict.error === "too_many" ? 429 : 400;
      return json({ ok: false, message: PHONE_OTP_ERRORS[verdict.error] }, status);
    }

    const verifiedPhone = row.phone_pending as string;
    const digits = verifiedPhone.replace(/\D/g, "");
    const variants = [...new Set([verifiedPhone, `+${digits}`, digits])];
    const { data: taken } = await admin
      .from("users")
      .select("id")
      .in("phone", variants)
      .neq("id", userId)
      .limit(1);
    if (taken && taken.length > 0) {
      return json({ ok: false, message: PHONE_OTP_ERRORS.taken }, 400);
    }

    const { error: updateError } = await admin
      .from("users")
      .update({
        phone: verifiedPhone,
        phone_verified: true,
        phone_pending: null,
        phone_verify_hash: null,
        phone_verify_expires_at: null,
        phone_verify_attempts: 0,
        updated_at: new Date().toISOString(),
        ...personalChatPatch(
          verifiedPhone,
          row.whatsapp_capture_group_chat_id,
          row.whatsapp_capture_group_name,
        ),
      })
      .eq("id", userId);
    if (updateError) {
      return json({ ok: false, message: "אימות המספר נכשל. נסו שוב." }, 500);
    }
    return json({
      ok: true,
      message: "הטלפון אומת וקושר בהצלחה",
      phone: verifiedPhone,
    });
  }

  return json({ ok: false, message: "פעולה לא מוכרת" }, 400);
});
