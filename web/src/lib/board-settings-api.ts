import {
  DEFAULT_INBOX_ARCHIVE_HOURS,
  type BoardSettings,
  type InboxArchiveHours,
} from "./board-settings";
import { isDemoMode, isSupabaseConfigured } from "./supabase";
import { apiFetch } from "./api";
import { getCloudUserProfile, updateCloudUserProfile } from "./user-profile";

const DEMO_BOARD_SETTINGS_KEY = "mindtasker:demo:board-settings";

function readLocalSettings(): BoardSettings {
  try {
    const raw = localStorage.getItem(DEMO_BOARD_SETTINGS_KEY);
    if (!raw) return { inbox_archive_hours: DEFAULT_INBOX_ARCHIVE_HOURS };
    const parsed = JSON.parse(raw) as BoardSettings;
    return {
      inbox_archive_hours: parsed.inbox_archive_hours ?? DEFAULT_INBOX_ARCHIVE_HOURS,
    };
  } catch {
    return { inbox_archive_hours: DEFAULT_INBOX_ARCHIVE_HOURS };
  }
}

function writeLocalSettings(settings: BoardSettings): void {
  localStorage.setItem(DEMO_BOARD_SETTINGS_KEY, JSON.stringify(settings));
}

function toBoardSettings(hours: number | undefined): BoardSettings {
  return {
    inbox_archive_hours: (hours ?? DEFAULT_INBOX_ARCHIVE_HOURS) as InboxArchiveHours,
  };
}

/** Board prefs live on the Supabase user row when cloud is configured. */
export async function getBoardSettingsApi(): Promise<BoardSettings> {
  if (isDemoMode) return readLocalSettings();
  if (isSupabaseConfigured) {
    const profile = await getCloudUserProfile();
    return toBoardSettings(profile.inbox_archive_hours);
  }
  const data = await apiFetch<{ settings: BoardSettings }>("/api/board-settings");
  return data.settings;
}

export async function saveBoardSettingsApi(
  patch: Partial<BoardSettings>,
): Promise<BoardSettings> {
  if (isDemoMode) {
    const next = { ...readLocalSettings(), ...patch };
    writeLocalSettings(next);
    return next;
  }
  if (isSupabaseConfigured) {
    if (patch.inbox_archive_hours === undefined) {
      return getBoardSettingsApi();
    }
    const profile = await updateCloudUserProfile({
      inbox_archive_hours: patch.inbox_archive_hours,
    });
    return toBoardSettings(profile.inbox_archive_hours);
  }
  const data = await apiFetch<{ settings: BoardSettings }>("/api/board-settings", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.settings;
}

export type { BoardSettings, InboxArchiveHours };
