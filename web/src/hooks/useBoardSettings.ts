import { useCallback, useEffect, useState } from "react";
import { DEFAULT_INBOX_ARCHIVE_HOURS } from "../lib/board-settings";
import {
  getBoardSettingsApi,
  saveBoardSettingsApi,
  type BoardSettings,
} from "../lib/board-settings-api";

export function useBoardSettings() {
  const [settings, setSettings] = useState<BoardSettings>({
    inbox_archive_hours: DEFAULT_INBOX_ARCHIVE_HOURS,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSettings(await getBoardSettingsApi());
    } catch {
      setSettings({ inbox_archive_hours: DEFAULT_INBOX_ARCHIVE_HOURS });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (patch: Partial<BoardSettings>) => {
      const saved = await saveBoardSettingsApi(patch);
      setSettings(saved);
      return saved;
    },
    [],
  );

  return { settings, loading, save, refresh };
}
