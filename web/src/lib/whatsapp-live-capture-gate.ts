import { isPersonalCaptureLabel } from "../../../supabase/functions/_shared/green-api-chats.ts";

export const PERSONAL_CAPTURE_NAME = "הודעה לעצמי (BabiTk)";

export const SEND_GROUP_MESSAGE_HINT =
  "שלחו הודעה בקבוצה מהוואטסאפ שמחובר ל-BabiTk. אחרי שהקבוצה תיקשר נמשוך את המשימות למחברת.";

type CaptureProfile = {
  phone?: string | null;
  whatsapp_capture_group_chat_id?: string | null;
  whatsapp_capture_group_name?: string | null;
};

function personalChatIdFromPhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `${digits}@c.us`;
}

/**
 * Live webhook (babi-v5) rejects group posts when a custom name is saved on a personal @c.us id
 * AND the incoming chatName does not match. Do not wipe the custom name — restore @g.us instead.
 */
export function liveCaptureGateBlocksGroup(profile: CaptureProfile): boolean {
  const id = profile.whatsapp_capture_group_chat_id?.trim() ?? "";
  if (id.toLowerCase().endsWith("@g.us")) return false;
  const name = profile.whatsapp_capture_group_name?.trim() ?? "";
  if (!name) return false;
  return !isPersonalCaptureLabel(name);
}

export function personalCaptureRepairPatch(profile: CaptureProfile): {
  whatsapp_capture_group_chat_id: string | null;
  whatsapp_capture_group_name: string;
} {
  const existing = profile.whatsapp_capture_group_chat_id?.trim() ?? "";
  if (existing.toLowerCase().endsWith("@g.us") || existing.toLowerCase().endsWith("@c.us")) {
    return {
      whatsapp_capture_group_chat_id: existing,
      whatsapp_capture_group_name: PERSONAL_CAPTURE_NAME,
    };
  }
  return {
    whatsapp_capture_group_chat_id: personalChatIdFromPhone(profile.phone ?? null),
    whatsapp_capture_group_name: PERSONAL_CAPTURE_NAME,
  };
}
