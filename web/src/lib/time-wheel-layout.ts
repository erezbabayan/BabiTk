import { HOUR_OPTIONS } from "../lib/due-date-fields";

export const MINUTE_WHEEL_OPTIONS = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, "0"),
);

export const TIME_WHEEL_ITEM_HEIGHT = 26;
export const TIME_WHEEL_VISIBLE_ROWS = 3;

export function snapMinuteToWheel(minute: string): string {
  const n = Number.parseInt(minute, 10);
  if (!Number.isFinite(n)) return "00";
  const snapped = Math.round(n / 5) * 5;
  if (snapped >= 60) return "55";
  return String(snapped).padStart(2, "0");
}

export function wheelIndexForValue(options: readonly string[], value: string): number {
  const idx = options.indexOf(value);
  return idx >= 0 ? idx : 0;
}

export { HOUR_OPTIONS };
