import { isDemoMode, isSupabaseConfigured, requireSupabase } from "./supabase";
import { currentAccessToken } from "./whatsapp-gateway";

export type WhatsAppReminderDispatchResult = {
  ok: boolean;
  sent?: number;
  already?: boolean;
  error?: string;
  destination?: string;
};

async function invokeWhatsAppReminders(
  body: { test?: boolean; itemId?: string; fireAt?: string },
): Promise<WhatsAppReminderDispatchResult> {
  if (isDemoMode || !isSupabaseConfigured) {
    return { ok: false, error: "demo" };
  }
  const accessToken = await currentAccessToken();
  if (!accessToken) {
    return { ok: false, error: "not_authenticated" };
  }
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke("whatsapp-send-reminders", {
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
  if (error) {
    return { ok: false, error: error.message || "send_failed" };
  }
  const payload = (data ?? {}) as WhatsAppReminderDispatchResult & { error?: string };
  if (payload.error) {
    return { ok: false, error: payload.error, sent: payload.sent ?? 0 };
  }
  return {
    ok: payload.ok !== false,
    sent: payload.sent,
    already: payload.already,
    destination: payload.destination,
  };
}

/** Send one due item to the configured WhatsApp group (or personal chat). */
export async function dispatchWhatsAppItemReminder(
  itemId: string,
  fireAt?: string,
): Promise<WhatsAppReminderDispatchResult> {
  if (!itemId.trim()) return { ok: false, error: "missing_item" };
  return invokeWhatsAppReminders({
    itemId,
    ...(fireAt ? { fireAt } : {}),
  });
}

/** Settings: send a test message to the connected group. */
export async function sendWhatsAppReminderTest(): Promise<WhatsAppReminderDispatchResult> {
  const result = await invokeWhatsAppReminders({ test: true });
  if (!result.ok) {
    throw new Error(
      result.error === "no_whatsapp_destination"
        ? "אין יעד וואטסאפ. חברו קבוצה או מספר."
        : result.error === "not_authenticated"
          ? "יש להתחבר כדי לשלוח בדיקה."
          : result.error === "demo"
            ? "במצב הדגמה אין שליחה לוואטסאפ."
            : result.error || "שליחת הבדיקה נכשלה",
    );
  }
  return result;
}
