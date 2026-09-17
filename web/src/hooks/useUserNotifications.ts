import { useCallback, useEffect, useState } from "react";

import { isSupabaseConfigured } from "../lib/supabase";
import {
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeUserNotifications,
  unreadNotificationCount,
  type UserNotification,
} from "../lib/user-notifications";
import { getCloudUserProfile } from "../lib/user-profile";

export function useUserNotifications(userId: string | null, enabled: boolean) {
  const [rows, setRows] = useState<UserNotification[] | undefined>(undefined);
  const [unread, setUnread] = useState(0);
  const [notifyInApp, setNotifyInApp] = useState(true);

  const refresh = useCallback(async () => {
    if (!enabled || !userId || !isSupabaseConfigured) {
      setRows([]);
      setUnread(0);
      return;
    }
    try {
      const [nextRows, nextUnread, profile] = await Promise.all([
        listUserNotifications(40),
        unreadNotificationCount(),
        getCloudUserProfile().catch(() => null),
      ]);
      setRows(nextRows);
      setUnread(nextUnread);
      if (profile) setNotifyInApp(profile.notify_in_app);
    } catch {
      setRows((current) => current ?? []);
    }
  }, [enabled, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !userId || !isSupabaseConfigured) return;
    return subscribeUserNotifications(userId, () => {
      void refresh();
    });
  }, [enabled, userId, refresh]);

  const markRead = useCallback(async (id: string) => {
    await markNotificationRead(id);
    setRows((current) =>
      current?.map((row) => (row.id === id ? { ...row, read: true } : row)),
    );
    setUnread((count) => Math.max(0, count - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    setRows((current) => current?.map((row) => ({ ...row, read: true })));
    setUnread(0);
  }, []);

  return {
    rows,
    unread,
    notifyInApp,
    refresh,
    markRead,
    markAllRead,
  };
}
