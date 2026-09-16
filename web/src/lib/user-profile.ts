import { requireSupabase } from "./supabase";

export type DigestDays = "weekdays" | "everyday";

export interface CloudUserProfile {
  id: string;
  email: string;
  username: string | null;
  phone: string | null;
  phone_verified: boolean;
  inbox_archive_hours: number;
  google_calendar_enabled: boolean;
  whatsapp_capture_group_chat_id: string | null;
  whatsapp_capture_group_name: string | null;
  whatsapp_digest_hours: number[];
  whatsapp_digest_days: DigestDays;
  tier: "free" | "premium";
  allocated_audio_seconds: number;
  used_audio_seconds: number;
  allocated_ai_parses: number;
  used_ai_parses: number;
  usage_period_start: string;
}

const PROFILE_SELECT = [
  "id",
  "email",
  "username",
  "phone",
  "phone_verified",
  "inbox_archive_hours",
  "google_calendar_enabled",
  "whatsapp_capture_group_chat_id",
  "whatsapp_capture_group_name",
  "whatsapp_digest_hours",
  "whatsapp_digest_days",
  "tier",
  "allocated_audio_seconds",
  "used_audio_seconds",
  "allocated_ai_parses",
  "used_ai_parses",
  "usage_period_start",
].join(",");

function asDigestDays(value: unknown): DigestDays {
  return value === "weekdays" ? "weekdays" : "everyday";
}

function asHours(value: unknown): number[] {
  if (!Array.isArray(value)) return [9];
  const hours = value
    .map((hour) => Number(hour))
    .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23);
  return hours.length > 0 ? hours.slice(0, 3) : [9];
}

function mapProfile(row: Record<string, unknown>, userId: string, email: string): CloudUserProfile {
  return {
    id: String(row.id ?? userId),
    email: String(row.email ?? email),
    username: typeof row.username === "string" ? row.username : null,
    phone: typeof row.phone === "string" ? row.phone : null,
    phone_verified: row.phone_verified === true,
    inbox_archive_hours: Number(row.inbox_archive_hours ?? 48),
    google_calendar_enabled: row.google_calendar_enabled === true,
    whatsapp_capture_group_chat_id:
      typeof row.whatsapp_capture_group_chat_id === "string"
        ? row.whatsapp_capture_group_chat_id
        : null,
    whatsapp_capture_group_name:
      typeof row.whatsapp_capture_group_name === "string"
        ? row.whatsapp_capture_group_name
        : null,
    whatsapp_digest_hours: asHours(row.whatsapp_digest_hours),
    whatsapp_digest_days: asDigestDays(row.whatsapp_digest_days),
    tier: row.tier === "premium" ? "premium" : "free",
    allocated_audio_seconds: Number(row.allocated_audio_seconds ?? 1800),
    used_audio_seconds: Number(row.used_audio_seconds ?? 0),
    allocated_ai_parses: Number(row.allocated_ai_parses ?? 50),
    used_ai_parses: Number(row.used_ai_parses ?? 0),
    usage_period_start:
      typeof row.usage_period_start === "string"
        ? row.usage_period_start
        : new Date().toISOString(),
  };
}

async function requireAuthUser(): Promise<{ id: string; email: string }> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Not authenticated");
  }
  return { id: data.user.id, email: data.user.email ?? "" };
}

export async function getCloudUserProfile(): Promise<CloudUserProfile> {
  const supabase = requireSupabase();
  const auth = await requireAuthUser();
  const { data, error } = await supabase
    .from("users")
    .select(PROFILE_SELECT)
    .eq("id", auth.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("פרופיל המשתמש לא נמצא");
  }
  return mapProfile(data as unknown as Record<string, unknown>, auth.id, auth.email);
}

export async function updateCloudUserProfile(
  patch: Partial<
    Pick<
      CloudUserProfile,
      | "phone"
      | "phone_verified"
      | "inbox_archive_hours"
      | "google_calendar_enabled"
      | "whatsapp_capture_group_chat_id"
      | "whatsapp_capture_group_name"
      | "whatsapp_digest_hours"
      | "whatsapp_digest_days"
    >
  >,
): Promise<CloudUserProfile> {
  const supabase = requireSupabase();
  const auth = await requireAuthUser();
  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("id", auth.id)
    .select(PROFILE_SELECT)
    .single();

  if (error) throw error;
  return mapProfile(data as unknown as Record<string, unknown>, auth.id, auth.email);
}
