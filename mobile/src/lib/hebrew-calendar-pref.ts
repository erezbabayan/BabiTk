import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "babitk:hebrew-calendar";

let current = true;
const listeners = new Set<(enabled: boolean) => void>();

function publish(enabled: boolean): void {
  current = enabled;
  for (const listener of listeners) listener(enabled);
}

export function hebrewCalendarEnabled(): boolean {
  return current;
}

export async function loadHebrewCalendarEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    publish(raw !== "0");
  } catch {
    publish(true);
  }
  return current;
}

export async function setHebrewCalendarEnabled(enabled: boolean): Promise<void> {
  publish(enabled);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Keep the in-memory value when storage is unavailable.
  }
}

export function subscribeHebrewCalendar(listener: (enabled: boolean) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}
