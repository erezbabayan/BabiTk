import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_INBOX_ARCHIVE_HOURS,
  type BoardSettings,
  type InboxArchiveHours,
} from "./board-settings";
import { apiFetch } from "./api";
import { isDemoMode } from "./supabase";

const DEMO_BOARD_SETTINGS_KEY = "mindtasker:demo:board-settings";

async function readDemoSettings(): Promise<BoardSettings> {
  try {
    const raw = await AsyncStorage.getItem(DEMO_BOARD_SETTINGS_KEY);
    if (!raw) return { inbox_archive_hours: DEFAULT_INBOX_ARCHIVE_HOURS };
    const parsed = JSON.parse(raw) as BoardSettings;
    return {
      inbox_archive_hours: parsed.inbox_archive_hours ?? DEFAULT_INBOX_ARCHIVE_HOURS,
    };
  } catch {
    return { inbox_archive_hours: DEFAULT_INBOX_ARCHIVE_HOURS };
  }
}

async function writeDemoSettings(settings: BoardSettings): Promise<void> {
  await AsyncStorage.setItem(DEMO_BOARD_SETTINGS_KEY, JSON.stringify(settings));
}

export async function getBoardSettings(): Promise<BoardSettings> {
  if (isDemoMode) return readDemoSettings();

  const res = await apiFetch("/api/board-settings");
  if (!res.ok) throw new Error(`Board settings failed: ${res.status}`);
  const data = (await res.json()) as { settings: BoardSettings };
  return data.settings;
}

export async function saveBoardSettings(
  patch: Partial<BoardSettings>,
): Promise<BoardSettings> {
  if (isDemoMode) {
    const next = { ...await readDemoSettings(), ...patch };
    await writeDemoSettings(next);
    return next;
  }

  const res = await apiFetch("/api/board-settings", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Save failed: ${res.status}`);
  }
  const data = (await res.json()) as { settings: BoardSettings };
  return data.settings;
}

export type { InboxArchiveHours };
