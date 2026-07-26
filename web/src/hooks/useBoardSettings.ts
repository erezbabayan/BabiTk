import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import {
  DEFAULT_INBOX_ARCHIVE_HOURS,
  type BoardSettings,
  type InboxArchiveHours,
} from "../lib/board-settings";
import {
  getBoardSettingsApi,
  saveBoardSettingsApi,
} from "../lib/board-settings-api";
import { useConvexFeatures } from "../lib/data-backend";
import { isDemoMode } from "../lib/supabase";
import { useSafeConvexAuthFromAuth } from "./useSafeConvexAuth";

const OFFLINE =
  isDemoMode || import.meta.env.VITE_USE_CONVEX === "false";

function toBoardSettings(hours: number | undefined): BoardSettings {
  const value = (hours ?? DEFAULT_INBOX_ARCHIVE_HOURS) as InboxArchiveHours;
  return { inbox_archive_hours: value };
}

function isInboxArchiveHours(value: number): value is InboxArchiveHours {
  return value === 48 || value === 72 || value === 168 || value === 720;
}

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

function useBoardSettingsConvex() {
  const convexConfigured = useConvexFeatures();
  const { isAuthenticated, isLoading: authLoading } = useSafeConvexAuthFromAuth();
  const viewer = useQuery(
    api.users.viewer,
    convexConfigured && isAuthenticated ? {} : "skip",
  );
  const convexUserId = viewer?.userId;

  const canQuery =
    convexConfigured && isAuthenticated && !authLoading && Boolean(convexUserId);

  const convexSettings = useQuery(
    api.boardSettings.getForUser,
    canQuery && convexUserId ? { userId: convexUserId } : "skip",
  );
  const updateForUser = useMutation(api.boardSettings.updateForUser);

  const [optimisticHours, setOptimisticHours] = useState<InboxArchiveHours | null>(
    null,
  );

  const serverSettings = useMemo(
    () => toBoardSettings(convexSettings?.inboxArchiveHours),
    [convexSettings],
  );

  useEffect(() => {
    if (
      optimisticHours !== null &&
      serverSettings.inbox_archive_hours === optimisticHours
    ) {
      setOptimisticHours(null);
    }
  }, [optimisticHours, serverSettings.inbox_archive_hours]);

  const settings = useMemo((): BoardSettings => {
    if (optimisticHours !== null) {
      return { inbox_archive_hours: optimisticHours };
    }
    return serverSettings;
  }, [optimisticHours, serverSettings]);

  const loading =
    authLoading ||
    (isAuthenticated && viewer === undefined) ||
    (canQuery && convexSettings === undefined && optimisticHours === null);

  const save = useCallback(
    async (patch: Partial<BoardSettings>) => {
      const rawHours = patch.inbox_archive_hours ?? settings.inbox_archive_hours;
      if (!isInboxArchiveHours(rawHours)) {
        throw new Error("ערך לא תקין");
      }
      if (!convexUserId) {
        throw new Error("יש להתחבר כדי לשמור הגדרות");
      }

      setOptimisticHours(rawHours);
      try {
        const saved = await updateForUser({
          userId: convexUserId,
          inboxArchiveHours: rawHours,
        });
        return toBoardSettings(saved.inboxArchiveHours);
      } catch (error) {
        setOptimisticHours(null);
        throw error;
      }
    },
    [convexUserId, updateForUser, settings.inbox_archive_hours],
  );

  return { settings, loading, save };
}

export const useBoardSettings = OFFLINE
  ? useBoardSettingsOffline
  : useBoardSettingsConvex;

// silence unused in offline builds
void isDemoMode;
