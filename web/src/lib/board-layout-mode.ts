/**
 * Decide 3-column desktop boards vs single-board mobile tabs.
 * Keep in sync with useIsDesktopBoard() in hooks/useMediaQuery.ts.
 *
 * Never trust CSS width alone — Android Chrome landscape / "Desktop site"
 * often reports ≥1024px and would wrongly show three boards.
 */
export function resolveIsDesktopBoard(options: {
  minWidth1024: boolean;
  pointerFine: boolean;
  hoverHover: boolean;
  isAndroid: boolean;
  /** Optional: UA Client Hints / touch phone signal. */
  uaMobile?: boolean;
}): boolean {
  if (options.isAndroid || options.uaMobile) return false;
  return (
    options.minWidth1024 && options.pointerFine && options.hoverHover
  );
}
