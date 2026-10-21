import { requireSupabase } from "./supabase";

type OtpResult = { message: string; phone?: string; alreadyVerified?: boolean };

async function invokePhoneOtp(body: { action: "request" | "verify"; phone?: string; code?: string }): Promise<OtpResult> {
  const supabase = requireSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("יש להתחבר מחדש");
  const { data, error } = await supabase.functions.invoke("whatsapp-phone-otp", {
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
  if (error) {
    let detail = error.message || "אימות המספר נכשל";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = (await context.clone().json()) as { message?: string; error?: string };
        detail = payload.message || payload.error || detail;
      } catch {
        // keep the invoke error
      }
    }
    throw new Error(detail);
  }
  const payload = (data ?? {}) as OtpResult & { ok?: boolean };
  if (payload.ok === false) {
    throw new Error(payload.message || "אימות המספר נכשל");
  }
  return payload;
}

export function requestWhatsAppPhoneOtp(phone: string): Promise<OtpResult> {
  return invokePhoneOtp({ action: "request", phone });
}

export function confirmWhatsAppPhoneOtp(code: string): Promise<OtpResult> {
  return invokePhoneOtp({ action: "verify", code });
}
