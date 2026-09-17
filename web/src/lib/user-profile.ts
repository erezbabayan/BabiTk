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
  notify_in_app: boolean;
  notify_browser: boolean;
  notify_whatsapp: boolean;
  notify_whatsapp_group: boolean;
  notify_overdue_reminders: boolean;
  overdue_first_hours: number;
  overdue_repeat_hours: number;
  onboarding_completed_at: string | null;
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
  "notify_in_app",
  "notify_browser",
  "notify_whatsapp",
  "notify_whatsapp_group",
  "notify_overdue_reminders",
  "overdue_first_hours",
  "overdue_repeat_hours",
  "onboarding_completed_at",
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
    notify_in_app: row.notify_in_app !== false,
    notify_browser: row.notify_browser === true,
    notify_whatsapp: row.notify_whatsapp !== false,
    notify_whatsapp_group: row.notify_whatsapp_group === true,
    notify_overdue_reminders: row.notify_overdue_reminders !== false,
    overdue_first_hours: Number(row.overdue_first_hours ?? 24),
    overdue_repeat_hours: Number(row.overdue_repeat_hours ?? 24),
    onboarding_completed_at:
      typeof row.onboarding_completed_at === "string" ? row.onboarding_completed_at : null,
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
  // Prefer the persisted session so opening Settings cannot invalidate a valid login.
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUser = sessionData.session?.user;
  if (sessionUser) {
    return { id: sessionUser.id, email: sessionUser.email ?? "" };
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Not authenticated");
  }
  return { id: data.user.id, email: data.user.email ?? "" };
}

export interface AuthAccountView {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
}

function metadataDisplayName(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) return null;
  const first =
    typeof metadata.first_name === "string" ? metadata.first_name.trim() : "";
  const last =
    typeof metadata.last_name === "string" ? metadata.last_name.trim() : "";
  const combined = [first, last].filter(Boolean).join(" ");
  if (combined) return combined;
  const full =
    typeof metadata.full_name === "string"
      ? metadata.full_name.trim()
      : typeof metadata.name === "string"
        ? metadata.name.trim()
        : "";
  return full || null;
}

/** Session + profile for Settings, without a network auth check that can sign the user out. */
export async function getAuthAccountView(): Promise<AuthAccountView | null> {
  const supabase = requireSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return null;

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const view: AuthAccountView = {
    id: user.id,
    email: user.email ?? "",
    username: typeof metadata.username === "string" ? metadata.username : null,
    displayName: metadataDisplayName(metadata),
  };

  try {
    const { data } = await supabase
      .from("users")
      .select("username,email")
      .eq("id", user.id)
      .maybeSingle();
    if (data && typeof data === "object") {
      const row = data as Record<string, unknown>;
      if (typeof row.username === "string" && row.username.trim()) {
        view.username = row.username;
      }
      if (typeof row.email === "string" && row.email.trim()) {
        view.email = row.email;
      }
    }
  } catch {
    // Keep session fields when the profile row is unavailable.
  }

  return view;
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
      | "notify_in_app"
      | "notify_browser"
      | "notify_whatsapp"
      | "notify_whatsapp_group"
      | "notify_overdue_reminders"
      | "overdue_first_hours"
      | "overdue_repeat_hours"
      | "onboarding_completed_at"
      | "tier"
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

export async function setCloudUserTier(
  tier: CloudUserProfile["tier"],
): Promise<CloudUserProfile> {
  if (tier !== "free" && tier !== "premium") {
    throw new Error("סוג מנוי לא תקין");
  }
  try {
    return await updateCloudUserProfile({ tier });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message && /[\u0590-\u05FF]/.test(message)) {
      throw err;
    }
    throw new Error("לא ניתן לעדכן את המנוי. נסו שוב.");
  }
}
