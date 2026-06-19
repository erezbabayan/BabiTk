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
