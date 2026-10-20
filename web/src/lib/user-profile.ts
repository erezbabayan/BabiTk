import { newUserProfileRow } from "./auth-account";
import { isMissingSchemaError } from "./schema-compat";

export type ProactiveWhatsAppPrefs = {
  morningEnabled: boolean;
  morningHour: number;
  morningMinute: number;
  followUpEnabled: boolean;
  followUpHour: number;
};

const PROACTIVE_DEFAULTS: ProactiveWhatsAppPrefs = {
  morningEnabled: false,
  morningHour: 7,
  morningMinute: 30,
  followUpEnabled: false,
  followUpHour: 20,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export async function loadProactiveWhatsAppPrefs(): Promise<ProactiveWhatsAppPrefs | null> {
  const supabase = requireSupabase();
  const auth = await requireAuthUser();
  const { data, error } = await supabase
    .from("users")
    .select(
      "whatsapp_morning_briefing_enabled, whatsapp_morning_briefing_hour, whatsapp_morning_briefing_minute, whatsapp_followup_enabled, whatsapp_followup_hour",
    )
    .eq("id", auth.id)
    .maybeSingle();
  if (error) {
    if (isMissingSchemaError(error)) return null;
    throw error;
  }
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    morningEnabled: row.whatsapp_morning_briefing_enabled === true,
    morningHour: clampInt(row.whatsapp_morning_briefing_hour, 0, 23, 7),
    morningMinute: clampInt(row.whatsapp_morning_briefing_minute, 0, 59, 30),
    followUpEnabled: row.whatsapp_followup_enabled === true,
    followUpHour: clampInt(row.whatsapp_followup_hour, 0, 23, 20),
  };
}

export async function saveProactiveWhatsAppPrefs(
  patch: Partial<ProactiveWhatsAppPrefs>,
): Promise<ProactiveWhatsAppPrefs> {
  const supabase = requireSupabase();
  const auth = await requireAuthUser();
  const row: Record<string, unknown> = {};
  if (patch.morningEnabled !== undefined) row.whatsapp_morning_briefing_enabled = patch.morningEnabled;
  if (patch.morningHour !== undefined) row.whatsapp_morning_briefing_hour = patch.morningHour;
  if (patch.morningMinute !== undefined) row.whatsapp_morning_briefing_minute = patch.morningMinute;
  if (patch.followUpEnabled !== undefined) row.whatsapp_followup_enabled = patch.followUpEnabled;
  if (patch.followUpHour !== undefined) row.whatsapp_followup_hour = patch.followUpHour;
  const { error } = await supabase.from("users").update(row).eq("id", auth.id);
  if (error) throw error;
  const loaded = await loadProactiveWhatsAppPrefs();
  return { ...PROACTIVE_DEFAULTS, ...(loaded ?? {}) };
}
import { requireSupabase } from "./supabase";
import { formatUserHeaderName, resolveUserNameParts } from "./user-display-name";

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

const PROFILE_SELECT_CORE = [
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

const PROFILE_SELECT = [
  PROFILE_SELECT_CORE,
  "notify_in_app",
  "notify_browser",
  "notify_whatsapp",
  "notify_whatsapp_group",
  "notify_overdue_reminders",
  "overdue_first_hours",
  "overdue_repeat_hours",
  "onboarding_completed_at",
].join(",");

const OPTIONAL_PROFILE_PATCH_KEYS = [
  "notify_in_app",
  "notify_browser",
  "notify_whatsapp",
  "notify_whatsapp_group",
  "notify_overdue_reminders",
  "overdue_first_hours",
  "overdue_repeat_hours",
  "onboarding_completed_at",
] as const;

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
  const parts = resolveUserNameParts({ userMetadata: metadata ?? null });
  if (!parts) return null;
  return formatUserHeaderName(parts) || null;
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

export { newUserProfileRow };

function isUsernameTakenError(error: { message?: string; code?: string } | null): boolean {
  const message = (error?.message ?? "").toLowerCase();
  const code = error?.code ?? "";
  return (
    code === "23505" ||
    message.includes("users_username") ||
    message.includes("duplicate key") ||
    message.includes("unique")
  );
}

/** Create the signed-in user's free-tier profile if the auth trigger missed it. */
export async function ensureOwnUserProfile(input: {
  id: string;
  email: string;
  username?: string | null;
}): Promise<void> {
  const supabase = requireSupabase();
  const { error } = await supabase
    .from("users")
    .upsert(newUserProfileRow(input.id, input.email, input.username), { onConflict: "id" });
  if (!error) return;
  if (isUsernameTakenError(error)) {
    throw new Error("שם המשתמש כבר תפוס");
  }
  throw error;
}

async function loadUserProfileRow(
  userId: string,
  email: string,
): Promise<Record<string, unknown>> {
  const supabase = requireSupabase();
  const full = await supabase
    .from("users")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();
  if (!full.error && full.data) {
    return full.data as unknown as Record<string, unknown>;
  }
  if (full.error && !isMissingSchemaError(full.error)) {
    throw full.error;
  }
  const core = await supabase
    .from("users")
    .select(PROFILE_SELECT_CORE)
    .eq("id", userId)
    .maybeSingle();
  if (core.error) throw core.error;
  if (core.data) {
    return core.data as unknown as Record<string, unknown>;
  }

  await ensureOwnUserProfile({ id: userId, email });
  const inserted = await supabase
    .from("users")
    .select(PROFILE_SELECT_CORE)
    .eq("id", userId)
    .maybeSingle();
  if (inserted.error) throw inserted.error;
  if (!inserted.data) {
    throw new Error("פרופיל המשתמש לא נמצא");
  }
  return inserted.data as unknown as Record<string, unknown>;
}

export async function getCloudUserProfile(): Promise<CloudUserProfile> {
  const auth = await requireAuthUser();
  const row = await loadUserProfileRow(auth.id, auth.email);
  return mapProfile(row, auth.id, auth.email);
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
  const full = await supabase
    .from("users")
    .update(patch)
    .eq("id", auth.id)
    .select(PROFILE_SELECT)
    .single();
  if (!full.error && full.data) {
    return mapProfile(full.data as unknown as Record<string, unknown>, auth.id, auth.email);
  }
  if (full.error && !isMissingSchemaError(full.error)) {
    throw full.error;
  }
  const corePatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (
      (OPTIONAL_PROFILE_PATCH_KEYS as readonly string[]).includes(key) ||
      value === undefined
    ) {
      continue;
    }
    corePatch[key] = value;
  }
  if (Object.keys(corePatch).length === 0) {
    return getCloudUserProfile();
  }
  const core = await supabase
    .from("users")
    .update(corePatch)
    .eq("id", auth.id)
    .select(PROFILE_SELECT_CORE)
    .single();
  if (core.error) throw core.error;
  return mapProfile(core.data as unknown as Record<string, unknown>, auth.id, auth.email);
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
