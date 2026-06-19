import {
  DEFAULT_INBOX_ARCHIVE_HOURS,
  type BoardSettings,
  type InboxArchiveHours,
} from "./board-settings";
import { isDemoMode } from "./supabase";
import { apiFetch } from "./api";

const DEMO_BOARD_SETTINGS_KEY = "mindtasker:demo:board-settings";

function readDemoSettings(): BoardSettings {
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

function writeDemoSettings(settings: BoardSettings): void {
  localStorage.setItem(DEMO_BOARD_SETTINGS_KEY, JSON.stringify(settings));
}

export async function getBoardSettingsApi(): Promise<BoardSettings> {
  if (isDemoMode) return readDemoSettings();
  const data = await apiFetch<{ settings: BoardSettings }>("/api/board-settings");
  return data.settings;
}

export async function saveBoardSettingsApi(
  patch: Partial<BoardSettings>,
): Promise<BoardSettings> {
  if (isDemoMode) {
    const next = { ...readDemoSettings(), ...patch };
    writeDemoSettings(next);
    return next;
  }
  const data = await apiFetch<{ settings: BoardSettings }>("/api/board-settings", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.settings;
}

export type { BoardSettings, InboxArchiveHours };
