export interface DueDateParts {
  date: string;
  hour: string;
  minute: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function splitDueDate(iso: string | null): DueDateParts {
  if (!iso) {
    return { date: "", hour: "09", minute: "00" };
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { date: "", hour: "09", minute: "00" };
  }
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    hour: pad(d.getHours()),
    minute: pad(d.getMinutes()),
  };
}

export function combineDueDate(parts: DueDateParts): string | null {
  if (!parts.date.trim()) return null;
  const hour = parts.hour.padStart(2, "0");
  const minute = parts.minute.padStart(2, "0");
  const parsed = new Date(`${parts.date}T${hour}:${minute}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function clampStep(value: number, min: number, max: number, step: number, delta: number): number {
  const span = max - min + 1;
  const next = value + delta * step;
  return ((next - min) % span + span) % span + min;
}

export const TIME_PRESETS = [
  { label: "בוקר", hour: "09", minute: "00" },
  { label: "צהריים", hour: "12", minute: "00" },
  { label: "אחה״צ", hour: "15", minute: "00" },
  { label: "ערב", hour: "18", minute: "00" },
  { label: "לילה", hour: "21", minute: "00" },
] as const;

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => pad(i));

export const MINUTE_STEP_OPTIONS = Array.from({ length: 12 }, (_, i) => pad(i * 5));

export function partsToTimeInput(parts: DueDateParts): string {
  return `${parts.hour.padStart(2, "0")}:${parts.minute.padStart(2, "0")}`;
}

export function timeInputToParts(time: string, current: DueDateParts): DueDateParts {
  const [hourRaw, minuteRaw] = time.split(":");
  const hour = Number.parseInt(hourRaw ?? "", 10);
  const minute = Number.parseInt(minuteRaw ?? "", 10);
  return {
    ...current,
    hour: Number.isFinite(hour) ? pad(Math.min(23, Math.max(0, hour))) : current.hour,
    minute: Number.isFinite(minute) ? pad(Math.min(59, Math.max(0, minute))) : current.minute,
  };
}

export function formatTimeLabel(parts: DueDateParts): string {
  const hour = Number.parseInt(parts.hour, 10) || 0;
  const minute = Number.parseInt(parts.minute, 10) || 0;
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export function partsToDateTime(parts: DueDateParts): Date {
  if (parts.date) {
    const parsed = new Date(`${parts.date}T${partsToTimeInput(parts)}:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const d = new Date();
  d.setHours(Number.parseInt(parts.hour, 10) || 9, Number.parseInt(parts.minute, 10) || 0, 0, 0);
  return d;
}

export function dateTimeToParts(date: Date, current: DueDateParts): DueDateParts {
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    hour: pad(date.getHours()),
    minute: pad(date.getMinutes()),
  };
}

export function timeFromDate(date: Date, current: DueDateParts): DueDateParts {
  return {
    ...current,
    hour: pad(date.getHours()),
    minute: pad(date.getMinutes()),
  };
}
