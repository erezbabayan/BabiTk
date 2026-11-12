import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";

import { handleReminderActionResponse } from "../lib/reminder-notification-handler";
import { parseReminderAction, reminderItemIdFromData } from "../lib/reminder-notification-actions";

/**
 * Reminder notification taps while the app runs, plus the cold-start tap.
 * Buttons are applied in place; a body tap calls onOpenItem(itemId) so the
 * board can open that item (warm start via the listener, cold start via the
 * last stored response).
 */
export function useReminderNotificationResponses(
  enabled: boolean,
  onOpenItem: (itemId: string) => void,
): void {
  const openRef = useRef(onOpenItem);
  openRef.current = onOpenItem;
  const openedKeys = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const handle = (response: Notifications.NotificationResponse | null | undefined) => {
      if (!response || cancelled) return;
      const action = parseReminderAction(response.actionIdentifier);
      if (action === "open") {
        const itemId = reminderItemIdFromData(response.notification.request.content.data);
        if (!itemId) return;
        const key = `${response.notification.request.identifier}|open`;
        if (openedKeys.current.has(key)) return;
        openedKeys.current.add(key);
        openRef.current(itemId);
        void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
        return;
      }
      if (action) void handleReminderActionResponse(response);
    };

    void Notifications.getLastNotificationResponseAsync()
      .then(handle)
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [enabled]);
}
