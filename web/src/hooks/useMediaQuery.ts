import { useEffect, useState } from "react";

import { resolveIsDesktopBoard } from "../lib/board-layout-mode";

function getInitialMatch(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(query).matches;
}

function detectAndroidUa(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}

function detectUaMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (
    navigator as Navigator & {
      userAgentData?: { mobile?: boolean };
    }
  ).userAgentData;
  if (typeof uaData?.mobile === "boolean") return uaData.mobile;
  // Fallback: classic mobile UA tokens (covers phones that spoof desktop width).
  return /Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent || "",
  );
}

/** Subscribe to a CSS media query — initializes from the current match to avoid layout flash. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => getInitialMatch(query));

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

/**
 * True only for real desktop mouse/trackpad layouts (3 boards side-by-side).
 *
 * Do NOT use width alone: Android Chrome (landscape / "Desktop site") often
 * reports ≥1024px CSS width and would incorrectly show all three boards.
 * Require a fine primary pointer + hover, and never treat phone UA as desktop.
 */
export function useIsDesktopBoard(): boolean {
  const wide = useMediaQuery("(min-width: 1024px)");
  const pointerFine = useMediaQuery("(pointer: fine)");
  const hoverHover = useMediaQuery("(hover: hover)");
  const [isAndroid, setIsAndroid] = useState(detectAndroidUa);
  const [uaMobile, setUaMobile] = useState(detectUaMobile);

  useEffect(() => {
    setIsAndroid(detectAndroidUa());
    setUaMobile(detectUaMobile());
  }, []);

  return resolveIsDesktopBoard({
    minWidth1024: wide,
    pointerFine,
    hoverHover,
    isAndroid,
    uaMobile,
  });
}

export { resolveIsDesktopBoard } from "../lib/board-layout-mode";
