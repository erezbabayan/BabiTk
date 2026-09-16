/** Display dates as dd/mm/yyyy regardless of the browser locale. */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_DATE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;

export const DATE_DISPLAY_PLACEHOLDER = "dd/mm/yyyy";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Convert a stored `YYYY-MM-DD` value to `dd/mm/yyyy`. */
export function isoDateToDdMmYyyy(isoDate: string | null | undefined): string {
  const match = ISO_DATE.exec(isoDate?.trim() ?? "");
  if (!match) return "";
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/** Format a local Date as zero-padded `dd/mm/yyyy`. */
export function formatLocalDateDdMmYyyy(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * Parse `dd/mm/yyyy` (also `.` or `-` separators, or 8 digits) into `YYYY-MM-DD`.
 * Month-first values like 09/18/2026 are rejected.
 */
export function ddMmYyyyToIsoDate(display: string): string | null {
  const trimmed = display.trim();
  if (!trimmed) return null;

  const slash = DISPLAY_DATE.exec(trimmed);
  if (slash) {
    return isoFromParts(Number(slash[3]), Number(slash[2]), Number(slash[1]));
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  return isoFromParts(
    Number(digits.slice(4, 8)),
    Number(digits.slice(2, 4)),
    Number(digits.slice(0, 2)),
  );
}
