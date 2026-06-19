import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MindtaskerItem } from "../lib/supabase";
import type { OfflineAction } from "./types";
import { CACHE_KEYS } from "./types";

export async function readCache(key: string): Promise<MindtaskerItem[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as MindtaskerItem[];
  } catch {
    return [];
  }
}

export async function writeCache(key: string, items: MindtaskerItem[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(items));
}

export async function readQueue(): Promise<OfflineAction[]> {
  const raw = await AsyncStorage.getItem(CACHE_KEYS.queue);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as OfflineAction[];
  } catch {
    return [];
  }
}

export async function writeQueue(actions: OfflineAction[]): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEYS.queue, JSON.stringify(actions));
}

export async function enqueueAction(
  action: Omit<OfflineAction, "id" | "createdAt">,
): Promise<OfflineAction> {
  const queue = await readQueue();
  const entry: OfflineAction = {
    ...action,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
  };
  queue.push(entry);
  await writeQueue(queue);
  return entry;
}

export function applyOptimistic(
  items: MindtaskerItem[],
  action: OfflineAction,
): MindtaskerItem[] {
  const now = new Date().toISOString();

  switch (action.type) {
    case "approve":
      return items.map((item) =>
        item.id === action.itemId
          ? { ...item, status: "pending" as const, last_interacted_at: now }
          : item,
      );
    case "complete":
      return items.filter((item) => item.id !== action.itemId);
    case "soft_delete":
      return items.filter((item) => item.id !== action.itemId);
    case "restore":
      return items;
    case "snooze":
      return items.map((item) =>
        item.id === action.itemId
          ? {
              ...item,
              due_date: (action.payload?.dueDate as string) ?? item.due_date,
              last_interacted_at: now,
            }
          : item,
      );
    case "update_tags":
      return items.map((item) =>
        item.id === action.itemId
          ? {
              ...item,
              tags: (action.payload?.tags as string[]) ?? item.tags,
              last_interacted_at: now,
            }
          : item,
      );
    default:
      return items;
  }
}
