/** A forwarded WhatsApp message becomes one task. Gratitude alone is ignored. */

const GRATITUDE = /^(?:תודה(?:\s+רבה)?|thanks|thank you)[!?.\s]*$/iu;
const WRAPPER = /^(?:הועבר(?:ה)?|forwarded message|fwd:).*$/i;

export function isGratitudeOnly(text: string): boolean {
  return GRATITUDE.test(text.trim());
}

export function forwardedTaskTitle(text: string): string {
  const lines = text
    .split(/\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !WRAPPER.test(line));
  const first = (lines[0] ?? text).replace(/^[-–—]\s*/u, "").trim();
  return (first || "הודעה שהועברה").slice(0, 80);
}

export function applyForwardedCapture<
  T extends { title: string; content: string; is_actionable: boolean },
>(text: string, rows: T[]): T[] {
  if (isGratitudeOnly(text)) return [];
  const title = forwardedTaskTitle(text);
  if (rows.length === 0) {
    return [
      {
        title,
        content: text.trim(),
        is_actionable: true,
      } as T,
    ];
  }
  const [first, ...rest] = rows;
  return [{ ...first!, title: first!.title?.trim() ? first!.title : title, is_actionable: true }, ...rest];
}
