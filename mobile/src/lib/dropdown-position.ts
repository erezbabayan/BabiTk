/**
 * Horizontal placement for a dropdown anchored under a (possibly narrow) trigger.
 * The panel gets a readable width (never the trigger's width when that is tiny),
 * keeps its right edge on the trigger's right edge (RTL), and is clamped inside
 * the screen. Returns `left` relative to the trigger's own left edge.
 */
export const DROPDOWN_MIN_WIDTH = 220;
export const DROPDOWN_MAX_WIDTH = 320;
export const DROPDOWN_SCREEN_MARGIN = 8;

export function rtlDropdownPlacement(
  anchorX: number,
  anchorWidth: number,
  screenWidth: number,
): { left: number; width: number } {
  const room = Math.max(0, screenWidth - DROPDOWN_SCREEN_MARGIN * 2);
  const width = Math.min(Math.max(anchorWidth, DROPDOWN_MIN_WIDTH), DROPDOWN_MAX_WIDTH, room);
  const anchorRight = anchorX + anchorWidth;
  const minLeft = DROPDOWN_SCREEN_MARGIN;
  const maxLeft = screenWidth - DROPDOWN_SCREEN_MARGIN - width;
  const absLeft = Math.min(Math.max(anchorRight - width, minLeft), Math.max(minLeft, maxLeft));
  return { left: absLeft - anchorX, width };
}
