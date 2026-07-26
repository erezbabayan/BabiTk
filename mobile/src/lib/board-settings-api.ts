import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_INBOX_ARCHIVE_HOURS,
  type BoardSettings,
  type InboxArchiveHours,
} from "./board-settings";

const BOARD_SETTINGS_KEY = "mindtasker:board-settings";

async function readLocalSettings(): Promise<BoardSettings> {
  try {
    const raw = await AsyncStorage.getItem(BOARD_SETTINGS_KEY);
    if (!raw) return { inbox_archive_hours: DEFAULT_INBOX_ARCHIVE_HOURS };
    const parsed = JSON.parse(raw) as BoardSettings;
    const hours = parsed.inbox_archive_hours;
    if (hours === 48 || hours === 72 || hours === 168 || hours === 720) {
      return { inbox_archive_hours: hours };
    }
    return { inbox_archive_hours: DEFAULT_INBOX_ARCHIVE_HOURS };
  } catch {
    return { inbox_archive_hours: DEFAULT_INBOX_ARCHIVE_HOURS };
  }
}

async function writeLocalSettings(settings: BoardSettings): Promise<void> {
  await AsyncStorage.setItem(BOARD_SETTINGS_KEY, JSON.stringify(settings));
}

/** Local fallback when Convex hooks are unavailable. Never depends on Supabase. */
export async function getBoardSettings(): Promise<BoardSettings> {
  return readLocalSettings();
}

export async function saveBoardSettings(
  patch: Partial<BoardSettings>,
): Promise<BoardSettings> {
  const next = { ...(await readLocalSettings()), ...patch };
  await writeLocalSettings(next);
  return next;
}

export type { InboxArchiveHours };
