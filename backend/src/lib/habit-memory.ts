/**
 * Usual morning hour, shopping weekday, and category.
 * Applied only after the same choice was seen at least twice. No model call.
 */

const MIN_SAMPLES = 2;
const TIMEZONE = "Asia/Jerusalem";

export type HabitMemory = {
  morningHours: Record<string, number>;
  shoppingWeekdays: Record<string, number>;
  categories: Record<string, number>;
};

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;

export function emptyHabitMemory(): HabitMemory {
  return { morningHours: {}, shoppingWeekdays: {}, categories: {} };
}

function countMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
    const parsed = Number(count);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 100) continue;
    out[key] = parsed;
  }
  return out;
}

export function readHabitMemory(value: unknown): HabitMemory {
  if (!value || typeof value !== "object") return emptyHabitMemory();
  const row = value as Record<string, unknown>;
  return {
    morningHours: countMap(row.morningHours),
    shoppingWeekdays: countMap(row.shoppingWeekdays),
    categories: countMap(row.categories),
  };
}

export function habitTrigger(text: string): boolean {
  return /בבוקר|לקנות|קניות|סופר/u.test(text);
}

function bump(map: Record<string, number>, key: string): Record<string, number> {
  const next = { ...map, [key]: Math.min(100, (map[key] ?? 0) + 1) };
  const keys = Object.keys(next).sort((a, b) => next[b]! - next[a]! || a.localeCompare(b));
  const trimmed: Record<string, number> = {};
  for (const name of keys.slice(0, 8)) trimmed[name] = next[name]!;
  return trimmed;
}

export function learnMorningHour(memory: HabitMemory, hour: number): HabitMemory {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return memory;
  return { ...memory, morningHours: bump(memory.morningHours, String(hour)) };
}

export function learnShoppingWeekday(memory: HabitMemory, weekday: number): HabitMemory {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return memory;
  return { ...memory, shoppingWeekdays: bump(memory.shoppingWeekdays, String(weekday)) };
}

export function learnCategory(memory: HabitMemory, tag: string): HabitMemory {
  const clean = tag.trim();
  if (clean.length < 2 || clean.length > 24) return memory;
  return { ...memory, categories: bump(memory.categories, clean) };
}

export function preferredKey(map: Record<string, number>, minimum = MIN_SAMPLES): string | null {
  let best: string | null = null;
  let bestCount = minimum - 1;
  for (const [key, count] of Object.entries(map)) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

export function explicitHour(text: string): number | null {
  const labeled = text.match(/(?:בשעה|ב-)\s*(\d{1,2})(?!\d)/u);
  const clock = text.match(/(?:^|\s)(\d{1,2}):(\d{2})(?!\d)/u);
  const raw = labeled?.[1] ?? clock?.[1];
  if (!raw) return null;
  const hour = Number(raw);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return hour;
}

export function explicitWeekday(text: string): number | null {
  for (let index = 0; index < WEEKDAYS.length; index++) {
    if (text.includes(`יום ${WEEKDAYS[index]}`) || text.includes(`ליום ${WEEKDAYS[index]}`)) return index;
  }
  return null;
}

type Zoned = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function zonedParts(date: Date): Zoned {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  const hour = Number(get("hour"));
  const weekday: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: hour === 24 ? 0 : hour,
    minute: Number(get("minute")),
    weekday: weekday[get("weekday")] ?? 0,
  };
}

function jerusalemIso(year: number, month: number, day: number, hour: number, minute: number): string {
  let ts = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const got = zonedParts(new Date(ts));
    const diff =
      (year - got.year) * 525_600 +
      (month - got.month) * 43_200 +
      (day - got.day) * 1_440 +
      (hour - got.hour) * 60 +
      (minute - got.minute);
    ts += diff * 60_000;
  }
  const resolved = zonedParts(new Date(ts));
  const offsetParts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(new Date(ts));
  const offset = offsetParts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+3";
  const match = offset.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  const sign = match?.[1]?.startsWith("-") ? "-" : "+";
  const hourNum = Math.abs(Number.parseInt(match?.[1] ?? "3", 10));
  const zone = `${sign}${pad(hourNum)}:${match?.[2] ?? "00"}`;
  return `${resolved.year}-${pad(resolved.month)}-${pad(resolved.day)}T${pad(resolved.hour)}:${pad(resolved.minute)}:00${zone}`;
}

function addDays(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

export function learnFromCapture(
  memory: HabitMemory,
  text: string,
  dueIso: string | null,
  tags: string[],
): HabitMemory {
  let next = memory;
  if (/בבוקר/u.test(text)) {
    const hour = explicitHour(text) ?? (dueIso ? zonedParts(new Date(dueIso)).hour : null);
    if (explicitHour(text) != null && hour != null) next = learnMorningHour(next, hour);
  }
  if (/לקנות|קניות|סופר/u.test(text)) {
    const weekday = explicitWeekday(text);
    if (weekday != null) next = learnShoppingWeekday(next, weekday);
  }
  const tag = tags.find((item) => item.trim().length >= 2);
  if (tag) next = learnCategory(next, tag);
  return next;
}

const CATEGORY_HINTS: Record<string, RegExp> = {
  פיננסי: /ארנונה|לשלם|חשבון|בנק/u,
  קניות: /לקנות|קניות|סופר/u,
  בריאות: /רופא|תרופה|קופת\s+חולים/u,
  לימודים: /לימוד|שיעור|מבחן/u,
  עבודה: /ישיבה|לקוח|בעבודה/u,
  בית: /בית\s+ספר|גן\s+ילדים/u,
};

function categoryHint(tag: string, text: string): boolean {
  const hint = CATEGORY_HINTS[tag];
  return Boolean(hint && hint.test(text));
}

export function applyHabitDefaults<T extends { due_date?: string | null; tags: string[] }>(
  text: string,
  rows: T[],
  memory: HabitMemory,
  now = new Date(),
): T[] {
  const morning = preferredKey(memory.morningHours);
  const shopping = preferredKey(memory.shoppingWeekdays);
  const category = preferredKey(memory.categories);
  return rows.map((row) => {
    let due = row.due_date ?? null;
    const tags = [...row.tags];
    if (/בבוקר/u.test(text) && explicitHour(text) == null && morning != null) {
      const hour = Number(morning);
      if (due) {
        const parts = zonedParts(new Date(due));
        if (parts.hour !== hour) due = jerusalemIso(parts.year, parts.month, parts.day, hour, 0);
      } else {
        const parts = zonedParts(now);
        const delta = parts.hour < hour ? 0 : 1;
        const day = addDays(parts.year, parts.month, parts.day, delta);
        due = jerusalemIso(day.year, day.month, day.day, hour, 0);
      }
    }
    if (/לקנות|קניות|סופר/u.test(text) && explicitWeekday(text) == null && !row.due_date && shopping != null) {
      const weekday = Number(shopping);
      const parts = zonedParts(now);
      let delta = (weekday - parts.weekday + 7) % 7;
      if (delta === 0 && parts.hour >= 9) delta = 7;
      const day = addDays(parts.year, parts.month, parts.day, delta);
      due = jerusalemIso(day.year, day.month, day.day, 9, 0);
    }
    if (tags.length === 0 && category && categoryHint(category, text)) {
      tags.push(category);
    }
    return { ...row, due_date: due, tags };
  });
}
