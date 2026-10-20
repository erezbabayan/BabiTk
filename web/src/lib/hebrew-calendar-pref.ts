const STORAGE_KEY = "babitk:hebrew-calendar";
export const HEBREW_CALENDAR_EVENT = "babitk-hebrew-calendar";

export function readHebrewCalendarEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function writeHebrewCalendarEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // Private mode keeps the in-memory toggle only.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(HEBREW_CALENDAR_EVENT));
  }
}
