import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_INBOX_ARCHIVE_HOURS,
  type BoardSettings,
} from "../lib/board-settings";
import {
  getBoardSettingsApi,
  saveBoardSettingsApi,
} from "../lib/board-settings-api";

function useBoardSettingsOffline() {
  const [settings, setSettings] = useState<BoardSettings>(() => ({
    inbox_archive_hours: DEFAULT_INBOX_ARCHIVE_HOURS,
  }));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getBoardSettingsApi().then((s) => {
      if (!cancelled) {
        setSettings(s);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (patch: Partial<BoardSettings>) => {
    const next = await saveBoardSettingsApi(patch);
    setSettings(next);
    return next;
  }, []);

  return { settings, loading, save };
}

export const useBoardSettings = useBoardSettingsOffline;
