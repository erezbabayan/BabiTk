import { useEffect, useMemo } from "react";

import {
  resolveItemReminderFireAt,
  type ReminderSourceItem,
} from "../lib/due-date-reminder";
import { isNativeApp, syncNativeReminders, type NativeReminderItem } from "../lib/native-bridge";

export function useNativeReminderSync(items: ReminderSourceItem[], enabled: boolean): void {
  const payloadKey = useMemo(() => {
    return items
      .map((item) => `${item.id}:${resolveItemReminderFireAt(item) ?? ""}:${item.title}`)
      .join("|");
  }, [items]);

  useEffect(() => {
    if (!enabled || !isNativeApp()) return;
    const payload: NativeReminderItem[] = [];
    for (const item of items) {
      const fireAt = resolveItemReminderFireAt(item);
      if (!fireAt) continue;
      payload.push({
        kind: item.is_actionable ? "task" : "notebook",
        id: item.id,
        title: item.title || "תזכורת",
        fireAt,
      });
    }
    syncNativeReminders(payload);
  }, [enabled, payloadKey, items]);
}
